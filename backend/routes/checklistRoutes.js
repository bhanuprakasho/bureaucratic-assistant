const express = require('express');
const router = express.Router();
const checklistController = require('../controllers/checklistController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.use(authenticateToken);

router.get('/', checklistController.getAllUserChecklists);
router.get('/:serviceId', checklistController.getChecklistByService);
router.post('/:serviceId', checklistController.saveChecklist);

module.exports = router;
