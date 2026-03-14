const { dbGet } = require('../config/db');

/**
 * Trial/Plan expiry middleware.
 * Must be used AFTER authMiddleware (req.user must be set).
 * Admins are fully exempt.
 * Returns 402 TRIAL_EXPIRED if the user's trial has expired AND they have no active paid plan.
 */
function trialMiddleware(req, res, next) {
    try {
        const user = dbGet(
            'SELECT role, trial_expires_at, plan_expires_at, current_plan_id FROM users WHERE id = ?',
            [req.user.id]
        );

        // Admins are always allowed
        if (!user || user.role === 'admin') return next();

        const now = new Date();
        const trialExpired = user.trial_expires_at && new Date(user.trial_expires_at) < now;
        const planActive = user.current_plan_id &&
            (!user.plan_expires_at || new Date(user.plan_expires_at) >= now);

        // Allow if trial is still valid OR there is an active plan
        if (!trialExpired || planActive) return next();

        return res.status(402).json({
            success: false,
            error: 'TRIAL_EXPIRED',
            message: 'Your trial has expired. Please contact the administrator to activate a plan.',
        });
    } catch (err) {
        console.error('Trial middleware error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

module.exports = trialMiddleware;
