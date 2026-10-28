const express = require('express');
const router = express.Router();
const eligibilityController = require('../controllers/eligibilityController');

router.get('/schemes', eligibilityController.getEligibilitySchemes);
router.post('/check', eligibilityController.checkEligibility);

module.exports = router;
