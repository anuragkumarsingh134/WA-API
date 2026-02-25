const whatsappService = require('../services/whatsappService');

/**
 * GET /api/messages/send-text
 * Query params: deviceId, apiKey, number, message
 * apiKeyMiddleware already validates apiKey, deviceId, and device ownership.
 */
async function sendText(req, res) {
    try {
        const { number, message } = req.query;
        const deviceId = req.device.device_id;

        // Validate number
        if (!number) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: 'Missing number parameter' });
        }
        if (!/^\d+$/.test(number)) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: 'Number must contain digits only (no + or spaces)' });
        }

        // Validate message
        if (!message || message.trim().length === 0) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: 'Message cannot be empty' });
        }

        const result = await whatsappService.sendTextMessage(deviceId, number, message);

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

        // Validate number
        if (!number) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: 'Missing number parameter' });
        }
        if (!/^\d+$/.test(number)) {
            return res.status(400).json({ success: false, messageId: null, status: 'failed', error: 'Number must contain digits only (no + or spaces)' });
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

        const result = await whatsappService.sendFileMessage(deviceId, number, url, fileName);

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

module.exports = { sendText, sendFile };
