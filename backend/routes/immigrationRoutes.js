const express = require('express');
const router = express.Router();
const immigrationController = require('../controllers/immigrationController');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');

// All immigration endpoints require authentication
router.use(authenticateToken);

// Citizen & Reviewer can create and view their cases
router.post('/cases', immigrationController.createCase);
router.get('/cases', immigrationController.listCases);
router.get('/cases/:id', immigrationController.getCaseById);
router.post('/cases/:id/documents', immigrationController.linkDocumentToCase);

// Only Reviewer and Admin can update flags and record official review decisions
router.patch('/cases/:id/flags/:flagId', requireRole('reviewer', 'admin'), immigrationController.updateFlagStatus);
router.post('/cases/:id/decision', requireRole('reviewer', 'admin'), immigrationController.recordDecision);

module.exports = router;
