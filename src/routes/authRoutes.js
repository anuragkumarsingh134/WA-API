const express = require('express');
const router = express.Router();
const { register, login, generateApiKey } = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes (requires JWT)
router.post('/api-key', authMiddleware, generateApiKey);

module.exports = router;
