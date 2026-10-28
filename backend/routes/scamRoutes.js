const express = require('express');
const router = express.Router();
const scamController = require('../controllers/scamController');
const { optionalAuth, authenticateToken } = require('../middleware/authMiddleware');

router.post('/analyze', optionalAuth, scamController.analyzeScam);
router.get('/reports', optionalAuth, scamController.getSavedReports);

module.exports = router;
