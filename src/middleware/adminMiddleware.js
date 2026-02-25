/**
 * Admin-only middleware. Must be used AFTER authMiddleware.
 * Checks that the authenticated user has role = 'admin'.
 */
const { dbGet } = require('../config/db');

async function adminMiddleware(req, res, next) {
    try {
        const user = dbGet('SELECT role FROM users WHERE id = ?', [req.user.id]);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }
        next();
    } catch (err) {
        console.error('Admin middleware error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

module.exports = adminMiddleware;
