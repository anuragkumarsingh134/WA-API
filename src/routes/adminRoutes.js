const express = require('express');
const router = express.Router();
const { listUsers, getUser, updateUser, deleteUser, resetMessageCounter } = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// All admin routes require JWT + admin role
router.use(authMiddleware);
router.use(adminMiddleware);

router.get('/users', listUsers);
router.get('/users/:id', getUser);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);
router.post('/users/:id/reset-counter', resetMessageCounter);

module.exports = router;
