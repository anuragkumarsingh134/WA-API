const { dbGet, dbRun, dbAll } = require('../config/db');
const whatsappService = require('../services/whatsappService');

/**
 * POST /device/create
 * Body: { deviceId, sessionName }
 * Requires JWT.
 */
async function createDevice(req, res) {
    try {
        const { deviceId, sessionName } = req.body;
        const userId = req.user.id;

        if (!deviceId) {
            return res.status(400).json({ success: false, error: 'deviceId is required' });
        }

        // Check if device already exists
        const existing = await dbGet('SELECT id FROM devices WHERE device_id = ?', [deviceId]);
        if (existing) {
            return res.status(400).json({ success: false, error: 'Device ID already exists' });
        }

        // Create device record
        await dbRun(
            'INSERT INTO devices (user_id, device_id, session_name, status) VALUES (?, ?, ?, ?)',
            [userId, deviceId, sessionName || deviceId, 'pending']
        );

        // Initialize Baileys session
        await whatsappService.createSession(deviceId);

        return res.status(201).json({
            success: true,
            deviceId,
            sessionName: sessionName || deviceId,
            status: 'pending',
            message: 'Device created. Scan QR code to connect.',
        });
    } catch (err) {
        console.error('Create device error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * GET /device/qr?deviceId=xxxx
 * Requires JWT.
 */
async function getQR(req, res) {
    try {
        const { deviceId } = req.query;
        const userId = req.user.id;

        if (!deviceId) {
            return res.status(400).json({ success: false, error: 'deviceId query parameter is required' });
        }

        // Verify ownership
        const device = await dbGet('SELECT * FROM devices WHERE device_id = ? AND user_id = ?', [deviceId, userId]);
        if (!device) {
            return res.status(404).json({ success: false, error: 'Device not found or access denied' });
        }

        if (device.status === 'connected') {
            return res.json({ success: true, status: 'connected', qr: null, message: 'Device is already connected' });
        }

        const qrDataUrl = whatsappService.getQR(deviceId);
        if (!qrDataUrl) {
            return res.json({ success: true, qr: null, message: 'QR code not yet available. Try again in a few seconds.' });
        }

        return res.json({ success: true, qr: qrDataUrl });
    } catch (err) {
        console.error('Get QR error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * GET /device/status?deviceId=xxxx
 * Requires JWT.
 */
async function getStatus(req, res) {
    try {
        const { deviceId } = req.query;
        const userId = req.user.id;

        if (!deviceId) {
            return res.status(400).json({ success: false, error: 'deviceId query parameter is required' });
        }

        const device = await dbGet('SELECT * FROM devices WHERE device_id = ? AND user_id = ?', [deviceId, userId]);
        if (!device) {
            return res.status(404).json({ success: false, error: 'Device not found or access denied' });
        }

        return res.json({
            success: true,
            deviceId: device.device_id,
            sessionName: device.session_name,
            status: device.status,
            createdAt: device.created_at,
        });
    } catch (err) {
        console.error('Get status error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * GET /device/list
 * Requires JWT. Lists all devices for the authenticated user.
 */
async function listDevices(req, res) {
    try {
        const userId = req.user.id;
        const devices = await dbAll('SELECT device_id, session_name, status, created_at FROM devices WHERE user_id = ?', [userId]);

        return res.json({ success: true, devices });
    } catch (err) {
        console.error('List devices error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * DELETE /device/delete?deviceId=xxxx
 * Requires JWT. Deletes device record, closes session, and removes auth state.
 */
async function deleteDevice(req, res) {
    try {
        const { deviceId } = req.query;
        const userId = req.user.id;

        if (!deviceId) {
            return res.status(400).json({ success: false, error: 'deviceId query parameter is required' });
        }

        const device = await dbGet('SELECT * FROM devices WHERE device_id = ? AND user_id = ?', [deviceId, userId]);
        if (!device) {
            return res.status(404).json({ success: false, error: 'Device not found or access denied' });
        }

        // Close Baileys session and clean up auth files
        await whatsappService.deleteSession(deviceId);

        // Delete message logs for this device
        await dbRun('DELETE FROM messages WHERE device_id = ?', [deviceId]);

        // Delete device record
        await dbRun('DELETE FROM devices WHERE device_id = ?', [deviceId]);

        return res.json({
            success: true,
            message: `Device ${deviceId} and all its data have been deleted`,
        });
    } catch (err) {
        console.error('Delete device error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * GET /device/profile-photo?deviceId=xxxx
 * Requires JWT. Returns the WhatsApp profile picture URL.
 */
async function getProfilePhoto(req, res) {
    try {
        const { deviceId } = req.query;
        const userId = req.user.id;

        if (!deviceId) {
            return res.status(400).json({ success: false, error: 'deviceId query parameter is required' });
        }

        const device = await dbGet('SELECT * FROM devices WHERE device_id = ? AND user_id = ?', [deviceId, userId]);
        if (!device) {
            return res.status(404).json({ success: false, error: 'Device not found or access denied' });
        }

        if (device.status !== 'connected') {
            return res.status(400).json({ success: false, error: 'Device is not connected' });
        }

        const photoUrl = await whatsappService.getProfilePicture(deviceId);

        return res.json({
            success: true,
            deviceId,
            profilePhoto: photoUrl,
            message: photoUrl ? 'Profile photo retrieved' : 'No profile photo set',
        });
    } catch (err) {
        console.error('Get profile photo error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

module.exports = { createDevice, getQR, getStatus, listDevices, deleteDevice, getProfilePhoto };
