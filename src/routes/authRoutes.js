const express = require('express');
const router = express.Router();
const { register, login, generateApiKey, getMe } = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes (requires JWT)
router.post('/api-key', authMiddleware, generateApiKey);
router.get('/me', authMiddleware, getMe);

module.exports = router;
