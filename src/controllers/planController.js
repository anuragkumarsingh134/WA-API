const { dbGet, dbRun, dbAll } = require('../config/db');

/**
 * GET /plans/list
 * Public: List all active plans for purchase page.
 */
async function listPlans(req, res) {
    try {
        const plans = dbAll('SELECT id, name, description, price, duration_days, device_limit, message_limit FROM plans WHERE is_active = 1 ORDER BY price ASC', []);
        return res.json({ success: true, plans });
    } catch (err) {
        console.error('List plans error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * GET /plans/all
 * Admin: List ALL plans (including inactive).
 */
async function listAllPlans(req, res) {
    try {
        const plans = dbAll('SELECT * FROM plans ORDER BY created_at DESC', []);
        return res.json({ success: true, plans });
    } catch (err) {
        console.error('List all plans error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * POST /plans/create
 * Admin: Create a new plan.
 * Body: { name, description, price, durationDays, deviceLimit, messageLimit }
 */
async function createPlan(req, res) {
    try {
        const { name, description, price, durationDays, deviceLimit, messageLimit } = req.body;

        if (!name || price === undefined || !durationDays || !deviceLimit || !messageLimit) {
            return res.status(400).json({ success: false, error: 'name, price, durationDays, deviceLimit, and messageLimit are required' });
        }

        const result = dbRun(
            'INSERT INTO plans (name, description, price, duration_days, device_limit, message_limit) VALUES (?, ?, ?, ?, ?, ?)',
            [name, description || '', price, durationDays, deviceLimit, messageLimit]
        );

        return res.status(201).json({ success: true, planId: result.lastID, message: 'Plan created successfully' });
    } catch (err) {
        console.error('Create plan error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * PUT /plans/:id
 * Admin: Update a plan.
 */
async function updatePlan(req, res) {
    try {
        const planId = req.params.id;
        const { name, description, price, durationDays, deviceLimit, messageLimit, isActive } = req.body;

        const plan = dbGet('SELECT id FROM plans WHERE id = ?', [planId]);
        if (!plan) {
            return res.status(404).json({ success: false, error: 'Plan not found' });
        }

        const updates = [];
        const params = [];

        if (name !== undefined) { updates.push('name = ?'); params.push(name); }
        if (description !== undefined) { updates.push('description = ?'); params.push(description); }
        if (price !== undefined) { updates.push('price = ?'); params.push(price); }
        if (durationDays !== undefined) { updates.push('duration_days = ?'); params.push(durationDays); }
        if (deviceLimit !== undefined) { updates.push('device_limit = ?'); params.push(deviceLimit); }
        if (messageLimit !== undefined) { updates.push('message_limit = ?'); params.push(messageLimit); }
        if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        params.push(planId);
        dbRun(`UPDATE plans SET ${updates.join(', ')} WHERE id = ?`, params);

        return res.json({ success: true, message: 'Plan updated' });
    } catch (err) {
        console.error('Update plan error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * DELETE /plans/:id
 * Admin: Delete a plan (soft delete — set is_active = 0).
 */
async function deletePlan(req, res) {
    try {
        const planId = req.params.id;
        dbRun('UPDATE plans SET is_active = 0 WHERE id = ?', [planId]);
        return res.json({ success: true, message: 'Plan deactivated' });
    } catch (err) {
        console.error('Delete plan error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

module.exports = { listPlans, listAllPlans, createPlan, updatePlan, deletePlan };
