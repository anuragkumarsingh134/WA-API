const express = require('express');
const router = express.Router();
const { sendText, sendFile } = require('../controllers/messageController');
const apiKeyMiddleware = require('../middleware/apiKeyMiddleware');

// All message routes use API key middleware (reads from query string)
router.use(apiKeyMiddleware);

// Legacy GET pattern
router.get('/send-text', sendText);
router.get('/send-file', sendFile);

module.exports = router;
