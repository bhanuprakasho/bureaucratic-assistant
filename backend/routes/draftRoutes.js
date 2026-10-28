const express = require('express');
const router = express.Router();
const draftController = require('../controllers/draftController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.use(authenticateToken);

router.get('/', draftController.getUserDrafts);
router.get('/:id', draftController.getDraftById);
router.post('/', draftController.saveDraft);
router.delete('/:id', draftController.deleteDraft);

module.exports = router;
