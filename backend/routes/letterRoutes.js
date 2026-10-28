const express = require('express');
const router = express.Router();
const letterController = require('../controllers/letterController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.use(authenticateToken);

router.post('/generate', letterController.generateLetter);
router.get('/', letterController.getUserLetters);
router.get('/:id', letterController.getLetterById);
router.put('/:id', letterController.updateLetter);
router.delete('/:id', letterController.deleteLetter);

module.exports = router;
