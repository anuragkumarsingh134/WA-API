const express = require('express');
const router = express.Router();
const { createDevice, getQR, getStatus, listDevices, deleteDevice, getProfilePhoto } = require('../controllers/deviceController');
const authMiddleware = require('../middleware/authMiddleware');
const trialMiddleware = require('../middleware/trialMiddleware');

// All device routes require JWT + active trial/plan
router.use(authMiddleware);
router.use(trialMiddleware);

router.post('/create', createDevice);
router.get('/qr', getQR);
router.get('/status', getStatus);
router.get('/list', listDevices);
router.get('/profile-photo', getProfilePhoto);
router.delete('/delete', deleteDevice);

module.exports = router;
