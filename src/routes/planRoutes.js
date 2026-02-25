const express = require('express');
const router = express.Router();
const { listPlans, listAllPlans, createPlan, updatePlan, deletePlan } = require('../controllers/planController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// Public: list active plans
router.get('/list', listPlans);

// Admin-only routes
router.get('/all', authMiddleware, adminMiddleware, listAllPlans);
router.post('/create', authMiddleware, adminMiddleware, createPlan);
router.put('/:id', authMiddleware, adminMiddleware, updatePlan);
router.delete('/:id', authMiddleware, adminMiddleware, deletePlan);

module.exports = router;
