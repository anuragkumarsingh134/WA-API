const express = require('express');
const router = express.Router();
const { createDevice, getQR, getStatus, listDevices, deleteDevice, getProfilePhoto } = require('../controllers/deviceController');
const authMiddleware = require('../middleware/authMiddleware');

// All device routes require JWT
router.use(authMiddleware);

router.post('/create', createDevice);
router.get('/qr', getQR);
router.get('/status', getStatus);
router.get('/list', listDevices);
router.get('/profile-photo', getProfilePhoto);
router.delete('/delete', deleteDevice);

module.exports = router;
