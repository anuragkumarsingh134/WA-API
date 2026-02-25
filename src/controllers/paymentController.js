const axios = require('axios');
const crypto = require('crypto');
const { dbGet, dbRun, dbAll } = require('../config/db');

const CF_API_VERSION = '2023-08-01';

function getCashfreeConfig() {
    const env = process.env.CASHFREE_ENV || 'sandbox';
    return {
        appId: process.env.CASHFREE_APP_ID,
        secretKey: process.env.CASHFREE_SECRET_KEY,
        baseUrl: env === 'production'
            ? 'https://api.cashfree.com/pg'
            : 'https://sandbox.cashfree.com/pg',
    };
}

/**
 * POST /payment/create-order
 * Body: { planId }
 * Creates a Cashfree order and returns the payment session ID.
 */
async function createOrder(req, res) {
    try {
        const { planId } = req.body;
        const userId = req.user.id;

        if (!planId) {
            return res.status(400).json({ success: false, error: 'planId is required' });
        }

        const plan = dbGet('SELECT * FROM plans WHERE id = ? AND is_active = 1', [planId]);
        if (!plan) {
            return res.status(404).json({ success: false, error: 'Plan not found or inactive' });
        }

        const user = dbGet('SELECT id, email FROM users WHERE id = ?', [userId]);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const cf = getCashfreeConfig();
        if (!cf.appId || !cf.secretKey) {
            return res.status(500).json({ success: false, error: 'Cashfree credentials not configured' });
        }

        const orderId = `ORDER_${userId}_${Date.now()}`;

        // Create order in Cashfree
        const cfResponse = await axios.post(`${cf.baseUrl}/orders`, {
            order_id: orderId,
            order_amount: plan.price,
            order_currency: 'INR',
            customer_details: {
                customer_id: `USER_${userId}`,
                customer_email: user.email.includes('@') ? user.email : `${user.email}@noemail.com`,
                customer_phone: user.email.match(/^\d+$/) ? user.email : '9999999999',
            },
            order_meta: {
                return_url: `${req.protocol}://${req.get('host')}/payment-status.html?order_id=${orderId}`,
            },
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-client-id': cf.appId,
                'x-client-secret': cf.secretKey,
                'x-api-version': CF_API_VERSION,
            }
        });

        const cfOrder = cfResponse.data;

        // Save order to database
        dbRun(
            'INSERT INTO orders (user_id, plan_id, cf_order_id, amount, status) VALUES (?, ?, ?, ?, ?)',
            [userId, planId, orderId, plan.price, 'pending']
        );

        return res.json({
            success: true,
            orderId,
            paymentSessionId: cfOrder.payment_session_id,
            cfOrderId: cfOrder.cf_order_id,
            environment: process.env.CASHFREE_ENV || 'sandbox',
        });
    } catch (err) {
        console.error('Create order error:', err.response?.data || err.message);
        return res.status(500).json({ success: false, error: err.response?.data?.message || 'Failed to create order' });
    }
}

/**
 * POST /payment/webhook
 * Cashfree webhook — receives payment status updates.
 * Verifies signature and activates plan on success.
 */
async function handleWebhook(req, res) {
    try {
        const cf = getCashfreeConfig();

        // Verify webhook signature
        const timestamp = req.headers['x-cashfree-timestamp'];
        const signature = req.headers['x-cashfree-signature'];
        const rawBody = req.rawBody || JSON.stringify(req.body);

        if (signature) {
            const expectedSignature = crypto
                .createHmac('sha256', cf.secretKey)
                .update(timestamp + rawBody)
                .digest('base64');

            if (signature !== expectedSignature) {
                console.error('Webhook signature mismatch');
                return res.status(401).json({ success: false, error: 'Invalid signature' });
            }
        }

        const data = req.body.data;
        if (!data || !data.order) {
            return res.status(400).json({ success: false, error: 'Invalid webhook payload' });
        }

        const { order_id, order_status } = data.order;
        const paymentId = data.payment?.cf_payment_id || null;

        const order = dbGet('SELECT * FROM orders WHERE cf_order_id = ?', [order_id]);
        if (!order) {
            console.error('Webhook: order not found', order_id);
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        if (order_status === 'PAID' && order.status !== 'paid') {
            // Update order status
            dbRun('UPDATE orders SET status = ?, cf_payment_id = ? WHERE cf_order_id = ?',
                ['paid', paymentId, order_id]);

            // Activate plan for user
            activatePlan(order.user_id, order.plan_id);
            console.log(`Payment SUCCESS: order=${order_id}, user=${order.user_id}`);
        } else if (['EXPIRED', 'CANCELLED', 'VOID'].includes(order_status)) {
            dbRun('UPDATE orders SET status = ? WHERE cf_order_id = ?', ['failed', order_id]);
        }

        return res.json({ success: true });
    } catch (err) {
        console.error('Webhook error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * GET /payment/verify/:orderId
 * Fallback: verify order status directly with Cashfree.
 */
async function verifyPayment(req, res) {
    try {
        const { orderId } = req.params;
        const userId = req.user.id;

        const order = dbGet('SELECT * FROM orders WHERE cf_order_id = ? AND user_id = ?', [orderId, userId]);
        if (!order) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        // If already marked as paid, return success
        if (order.status === 'paid') {
            return res.json({ success: true, status: 'paid', message: 'Payment already confirmed' });
        }

        // Check with Cashfree
        const cf = getCashfreeConfig();
        const cfResponse = await axios.get(`${cf.baseUrl}/orders/${orderId}`, {
            headers: {
                'x-client-id': cf.appId,
                'x-client-secret': cf.secretKey,
                'x-api-version': CF_API_VERSION,
            }
        });

        const cfOrder = cfResponse.data;

        if (cfOrder.order_status === 'PAID') {
            dbRun('UPDATE orders SET status = ? WHERE cf_order_id = ?', ['paid', orderId]);
            activatePlan(order.user_id, order.plan_id);
            return res.json({ success: true, status: 'paid', message: 'Payment confirmed' });
        } else {
            const status = cfOrder.order_status === 'ACTIVE' ? 'pending' : 'failed';
            dbRun('UPDATE orders SET status = ? WHERE cf_order_id = ?', [status, orderId]);
            return res.json({ success: true, status, message: `Order status: ${cfOrder.order_status}` });
        }
    } catch (err) {
        console.error('Verify payment error:', err.response?.data || err.message);
        return res.status(500).json({ success: false, error: 'Failed to verify payment' });
    }
}

/**
 * GET /payment/history
 * Returns user's payment/order history.
 */
async function paymentHistory(req, res) {
    try {
        const userId = req.user.id;
        const orders = dbAll(`
            SELECT o.id, o.cf_order_id, o.amount, o.status, o.created_at,
                   p.name as plan_name, p.duration_days, p.device_limit, p.message_limit
            FROM orders o
            JOIN plans p ON o.plan_id = p.id
            WHERE o.user_id = ?
            ORDER BY o.created_at DESC
        `, [userId]);

        return res.json({ success: true, orders });
    } catch (err) {
        console.error('Payment history error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/**
 * Activate a plan for a user — update their limits and expiry.
 */
function activatePlan(userId, planId) {
    const plan = dbGet('SELECT * FROM plans WHERE id = ?', [planId]);
    if (!plan) return;

    const expiresAt = new Date(Date.now() + plan.duration_days * 24 * 60 * 60 * 1000).toISOString();

    dbRun(`
        UPDATE users SET
            current_plan_id = ?,
            plan_expires_at = ?,
            device_limit = ?,
            message_limit = ?,
            trial_expires_at = NULL
        WHERE id = ?
    `, [planId, expiresAt, plan.device_limit, plan.message_limit, userId]);

    console.log(`Plan activated: user=${userId}, plan=${plan.name}, expires=${expiresAt}`);
}

module.exports = { createOrder, handleWebhook, verifyPayment, paymentHistory };
