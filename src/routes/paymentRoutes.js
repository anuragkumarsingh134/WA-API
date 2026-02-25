const express = require('express');
const router = express.Router();
const { createOrder, handleWebhook, verifyPayment, paymentHistory } = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware');

// Webhook — no auth (called by Cashfree)
router.post('/webhook', handleWebhook);

// Authenticated routes
router.post('/create-order', authMiddleware, createOrder);
router.get('/verify/:orderId', authMiddleware, verifyPayment);
router.get('/history', authMiddleware, paymentHistory);

module.exports = router;
