const whatsappService = require('../services/whatsappService');
const { dbGet, dbRun } = require('../config/db');

/**
 * Check and reset daily message counter if needed.
 * Returns the user record with current counter.
 */
function checkAndResetDailyCounter(userId) {
    const user = dbGet('SELECT messages_sent_today, message_limit, last_message_reset, role FROM users WHERE id = ?', [userId]);
    if (!user) return null;

    const today = new Date().toISOString().split('T')[0];
    if (user.last_message_reset !== today) {
        dbRun('UPDATE users SET messages_sent_today = 0, last_message_reset = ? WHERE id = ?', [today, userId]);
        user.messages_sent_today = 0;
    }
    return user;
}

/**
 * Increment message counter for a user.
 */
function incrementMessageCounter(userId) {
    dbRun('UPDATE users SET messages_sent_today = messages_sent_today + 1 WHERE id = ?', [userId]);
}

/**
 * GET /api/messages/send-text
 * Query params: deviceId, apiKey, number, message
 * apiKeyMiddleware already validates apiKey, deviceId, and device ownership.
 */
async function sendText(req, res) {
    try {
        const { number, message } = req.query;
        const deviceId = req.device.device_id;
        const userId = req.apiUser.id;

        // Validate number
        if (!number) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: 'Missing number parameter' });
        }
        if (!/^[a-zA-Z0-9\-@.]+$/.test(number)) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: 'Number must contain digits, or be a valid Group ID (e.g. 123-456@g.us)' });
        }

        // Validate message
        if (!message || message.trim().length === 0) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: 'Message cannot be empty' });
        }

        // Enforce message limit
        const user = checkAndResetDailyCounter(userId);
        if (user && user.role !== 'admin' && user.messages_sent_today >= user.message_limit) {
            return res.status(429).json({ success: false, messageId: null, status: 'failed', error: `Daily message limit reached (${user.message_limit}). Resets at midnight.` });
        }

        const result = await whatsappService.sendTextMessage(deviceId, number, message);

        // Increment counter on success
        incrementMessageCounter(userId);

        return res.json({
            success: true,
            messageId: result.messageId,
            status: result.status,
            error: null,
        });
    } catch (err) {
        console.error('Send text error:', err);
        return res.status(500).json({
            success: false,
            messageId: null,
            status: 'failed',
            error: err.message || 'Internal server error',
        });
    }
}

/**
 * GET /api/messages/send-file
 * Query params: deviceId, apiKey, number, url, fileName
 * apiKeyMiddleware already validates apiKey, deviceId, and device ownership.
 */
async function sendFile(req, res) {
    try {
        const { number, url, fileName } = req.query;
        const deviceId = req.device.device_id;
        const userId = req.apiUser.id;

        // Validate number
        if (!number) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: 'Missing number parameter' });
        }
        if (!/^[a-zA-Z0-9\-@.]+$/.test(number)) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: 'Number must contain digits, or be a valid Group ID (e.g. 123-456@g.us)' });
        }

        // Validate URL
        if (!url) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: 'Missing url parameter' });
        }
        if (!url.startsWith('https://')) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: 'File URL must use HTTPS' });
        }

        // Validate fileName
        if (!fileName) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: 'Missing fileName parameter' });
        }

        // Enforce message limit
        const user = checkAndResetDailyCounter(userId);
        if (user && user.role !== 'admin' && user.messages_sent_today >= user.message_limit) {
            return res.status(429).json({ success: false, messageId: null, status: 'failed', error: `Daily message limit reached (${user.message_limit}). Resets at midnight.` });
        }

        const result = await whatsappService.sendFileMessage(deviceId, number, url, fileName);

        // Increment counter on success
        incrementMessageCounter(userId);

        return res.json({
            success: true,
            messageId: result.messageId,
            status: result.status,
            error: null,
        });
    } catch (err) {
        console.error('Send file error:', err);
        return res.status(500).json({
            success: false,
            messageId: null,
            status: 'failed',
            error: err.message || 'Internal server error',
        });
    }
}

/**
 * GET /api/messages/send-image
 * Query params: deviceId, apiKey, number, url, caption
 * apiKeyMiddleware already validates apiKey, deviceId, and device ownership.
 */
async function sendImage(req, res) {
    try {
        const { number, url, caption } = req.query;
        const deviceId = req.device.device_id;
        const userId = req.apiUser.id;

        // Validate number
        if (!number) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: 'Missing number parameter' });
        }
        if (!/^[a-zA-Z0-9\-@.]+$/.test(number)) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: 'Number must contain digits, or be a valid Group ID (e.g. 123-456@g.us)' });
        }

        // Validate URL
        if (!url) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: 'Missing url parameter' });
        }
        if (!url.startsWith('https://')) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: 'Image URL must use HTTPS' });
        }

        // Enforce message limit
        const user = checkAndResetDailyCounter(userId);
        if (user && user.role !== 'admin' && user.messages_sent_today >= user.message_limit) {
            return res.status(429).json({ success: false, messageId: null, status: 'failed', error: `Daily message limit reached (${user.message_limit}). Resets at midnight.` });
        }

        const result = await whatsappService.sendImageMessage(deviceId, number, url, caption);

        // Increment counter on success
        incrementMessageCounter(userId);

        return res.json({
            success: true,
            messageId: result.messageId,
            status: result.status,
            error: null,
        });
    } catch (err) {
        console.error('Send image error:', err);
        return res.status(500).json({
            success: false,
            messageId: null,
            status: 'failed',
            error: err.message || 'Internal server error',
        });
    }
}

/**
 * GET /api/messages/groups
 * Query params: deviceId, apiKey
 */
async function getGroups(req, res) {
    try {
        const deviceId = req.device.device_id;
        const groups = await whatsappService.getGroups(deviceId);
        
        return res.json({
            success: true,
            groups,
            error: null,
        });
    } catch (err) {
        console.error('Get groups error:', err);
        return res.status(500).json({
            success: false,
            groups: null,
            error: err.message || 'Internal server error',
        });
    }
}

module.exports = { sendText, sendFile, sendImage, getGroups };
