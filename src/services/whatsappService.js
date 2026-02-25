const { default: makeWASocket, useMultiFileAuthState, DisconnectReason,
    fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const qrcode = require('qrcode');
const { dbRun, dbGet } = require('../config/db');
const sessionManager = require('./sessionManager');

const AUTH_DIR = path.join(__dirname, '..', '..', 'auth_info_baileys');
const logger = pino({ level: 'silent' });

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

/**
 * Create a new Baileys session for a device.
 */
async function createSession(deviceId) {
    const authDir = path.join(AUTH_DIR, deviceId);
    if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
        version,
        logger,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal: false,
        generateHighQualityLinkPreview: false,
    });

    // Handle connection updates
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            // Store QR code as base64 data URL
            try {
                const qrDataUrl = await qrcode.toDataURL(qr);
                sessionManager.setQR(deviceId, qrDataUrl);
                console.log(`[${deviceId}] QR code generated`);
            } catch (err) {
                console.error(`[${deviceId}] QR generation error:`, err.message);
            }
        }

        if (connection === 'open') {
            console.log(`[${deviceId}] Connected to WhatsApp`);
            sessionManager.clearQR(deviceId);
            await dbRun('UPDATE devices SET status = ? WHERE device_id = ?', ['connected', deviceId]);
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log(`[${deviceId}] Connection closed. Status: ${statusCode}. Reconnect: ${shouldReconnect}`);

            sessionManager.removeSession(deviceId);

            if (shouldReconnect) {
                // Attempt to reconnect
                await dbRun('UPDATE devices SET status = ? WHERE device_id = ?', ['disconnected', deviceId]);
                setTimeout(() => {
                    console.log(`[${deviceId}] Attempting reconnection...`);
                    createSession(deviceId).catch((err) => {
                        console.error(`[${deviceId}] Reconnection failed:`, err.message);
                    });
                }, 5000);
            } else {
                // Logged out — clean up auth state
                await dbRun('UPDATE devices SET status = ? WHERE device_id = ?', ['pending', deviceId]);
                try {
                    fs.rmSync(path.join(AUTH_DIR, deviceId), { recursive: true, force: true });
                } catch (_) { }
            }
        }
    });

    // Persist credentials on update
    socket.ev.on('creds.update', saveCreds);

    // Store in session manager
    sessionManager.setSession(deviceId, socket);

    return socket;
}

/**
 * Get QR code as base64 data URL for a device.
 */
function getQR(deviceId) {
    return sessionManager.getQR(deviceId);
}

/**
 * Get profile picture URL for a connected device.
 */
async function getProfilePicture(deviceId) {
    const socket = sessionManager.getSession(deviceId);
    if (!socket) return null;
    try {
        const jid = socket.user?.id;
        if (!jid) return null;
        const url = await socket.profilePictureUrl(jid, 'image');
        return url || null;
    } catch (_) {
        return null;
    }
}

/**
 * Send a text message via a connected device.
 */
async function sendTextMessage(deviceId, number, message) {
    const socket = sessionManager.getSession(deviceId);
    if (!socket) {
        throw new Error('Session not found or not connected');
    }

    const jid = formatJID(number);
    const result = await socket.sendMessage(jid, { text: message });

    // Log to database
    await dbRun(
        'INSERT INTO messages (device_id, recipient, message_type, status, message_id) VALUES (?, ?, ?, ?, ?)',
        [deviceId, number, 'text', 'sent', result.key.id]
    );

    return { messageId: result.key.id, status: 'sent' };
}

/**
 * Send a PDF file via a connected device.
 */
async function sendFileMessage(deviceId, number, url, fileName) {
    const socket = sessionManager.getSession(deviceId);
    if (!socket) {
        throw new Error('Session not found or not connected');
    }

    // Validate HTTPS
    if (!url.startsWith('https://')) {
        throw new Error('File URL must use HTTPS');
    }

    // Download the file
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        maxContentLength: MAX_FILE_SIZE,
        timeout: 30000,
        headers: { 'User-Agent': 'WhatsApp-API/1.0' },
    });

    // Validate content type
    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('application/pdf')) {
        throw new Error(`Invalid content type: ${contentType}. Only PDF files are supported.`);
    }

    // Validate file size
    const fileBuffer = Buffer.from(response.data);
    if (fileBuffer.length > MAX_FILE_SIZE) {
        throw new Error(`File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
    }

    const jid = formatJID(number);
    const result = await socket.sendMessage(jid, {
        document: fileBuffer,
        mimetype: 'application/pdf',
        fileName: fileName || 'document.pdf',
        caption: fileName || 'document.pdf',
    });

    // Log to database
    await dbRun(
        'INSERT INTO messages (device_id, recipient, message_type, status, message_id) VALUES (?, ?, ?, ?, ?)',
        [deviceId, number, 'file', 'sent', result.key.id]
    );

    return { messageId: result.key.id, status: 'sent' };
}

/**
 * Restore all previously connected sessions on server startup.
 */
async function restoreAllSessions() {
    try {
        const { dbAll } = require('../config/db');
        const devices = await dbAll("SELECT device_id FROM devices WHERE status IN ('connected', 'disconnected')");

        console.log(`Restoring ${devices.length} session(s)...`);

        for (const device of devices) {
            const authDir = path.join(AUTH_DIR, device.device_id);
            if (fs.existsSync(authDir)) {
                try {
                    await createSession(device.device_id);
                    console.log(`[${device.device_id}] Session restore initiated`);
                } catch (err) {
                    console.error(`[${device.device_id}] Failed to restore session:`, err.message);
                }
            }
        }
    } catch (err) {
        console.error('Error restoring sessions:', err.message);
    }
}

/**
 * Format a phone number into a WhatsApp JID.
 */
function formatJID(number) {
    // Strip any non-digit characters
    const clean = number.replace(/\D/g, '');
    return `${clean}@s.whatsapp.net`;
}

/**
 * Delete a session: close socket, remove from memory, delete auth files.
 */
async function deleteSession(deviceId) {
    const socket = sessionManager.getSession(deviceId);
    if (socket) {
        try {
            socket.ev.removeAllListeners();
            await socket.logout().catch(() => { });
            socket.end();
        } catch (_) { }
    }
    sessionManager.removeSession(deviceId);

    // Remove auth state from disk
    const authDir = path.join(AUTH_DIR, deviceId);
    try {
        if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
        }
    } catch (_) { }

    console.log(`[${deviceId}] Session deleted and cleaned up`);
}

module.exports = {
    createSession,
    getQR,
    getProfilePicture,
    sendTextMessage,
    sendFileMessage,
    restoreAllSessions,
    deleteSession,
};
