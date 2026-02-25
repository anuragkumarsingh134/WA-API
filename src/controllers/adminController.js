const { dbGet, dbRun, dbAll } = require('../config/db');

/**
 * GET /admin/users
 * List all users with their device count and message stats.
 */
async function listUsers(req, res) {
    try {
        const users = dbAll(`
            SELECT u.id, u.email, u.role, u.device_limit, u.message_limit,
                   u.messages_sent_today, u.trial_expires_at, u.is_active, u.created_at, u.api_key,
                   (SELECT COUNT(*) FROM devices WHERE user_id = u.id) as device_count
            FROM users u
            ORDER BY u.created_at DESC
        `, []);

        return res.json({ success: true, users });
    } catch (err) {
        console.error('List users error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * GET /admin/users/:id
 * Get single user details with their devices.
 */
async function getUser(req, res) {
    try {
        const userId = req.params.id;
        const user = dbGet(`
            SELECT id, email, role, device_limit, message_limit,
                   messages_sent_today, trial_expires_at, is_active, created_at, api_key
            FROM users WHERE id = ?
        `, [userId]);

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const devices = dbAll('SELECT device_id, session_name, status, created_at FROM devices WHERE user_id = ?', [userId]);
        const messageCount = dbGet('SELECT COUNT(*) as count FROM messages WHERE device_id IN (SELECT device_id FROM devices WHERE user_id = ?)', [userId]);

        return res.json({
            success: true,
            user: { ...user, devices, totalMessages: messageCount.count },
        });
    } catch (err) {
        console.error('Get user error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * PUT /admin/users/:id
 * Update user limits, trial expiry, active status.
 * Body: { deviceLimit, messageLimit, trialExpiresAt, isActive, role }
 */
async function updateUser(req, res) {
    try {
        const userId = req.params.id;
        const { deviceLimit, messageLimit, trialExpiresAt, isActive, role } = req.body;

        const user = dbGet('SELECT id, role FROM users WHERE id = ?', [userId]);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Prevent admin from demoting themselves
        if (user.id === req.user.id && role && role !== 'admin') {
            return res.status(400).json({ success: false, error: 'Cannot change your own admin role' });
        }

        const updates = [];
        const params = [];

        if (deviceLimit !== undefined) { updates.push('device_limit = ?'); params.push(deviceLimit); }
        if (messageLimit !== undefined) { updates.push('message_limit = ?'); params.push(messageLimit); }
        if (trialExpiresAt !== undefined) { updates.push('trial_expires_at = ?'); params.push(trialExpiresAt); }
        if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }
        if (role !== undefined) { updates.push('role = ?'); params.push(role); }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        params.push(userId);
        dbRun(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

        return res.json({ success: true, message: 'User updated successfully' });
    } catch (err) {
        console.error('Update user error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * DELETE /admin/users/:id
 * Delete a user and all their data.
 */
async function deleteUser(req, res) {
    try {
        const userId = req.params.id;

        if (parseInt(userId) === req.user.id) {
            return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
        }

        const user = dbGet('SELECT id FROM users WHERE id = ?', [userId]);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Delete user's messages
        dbRun('DELETE FROM messages WHERE device_id IN (SELECT device_id FROM devices WHERE user_id = ?)', [userId]);
        // Delete user's devices
        dbRun('DELETE FROM devices WHERE user_id = ?', [userId]);
        // Delete user
        dbRun('DELETE FROM users WHERE id = ?', [userId]);

        return res.json({ success: true, message: 'User and all associated data deleted' });
    } catch (err) {
        console.error('Delete user error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * POST /admin/users/:id/reset-counter
 * Reset daily message counter for a user.
 */
async function resetMessageCounter(req, res) {
    try {
        const userId = req.params.id;

        const user = dbGet('SELECT id FROM users WHERE id = ?', [userId]);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        dbRun('UPDATE users SET messages_sent_today = 0 WHERE id = ?', [userId]);

        return res.json({ success: true, message: 'Message counter reset' });
    } catch (err) {
        console.error('Reset counter error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

module.exports = { listUsers, getUser, updateUser, deleteUser, resetMessageCounter };
