const express = require('express');
const router = express.Router();
const knowledgeController = require('../controllers/knowledgeController');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');

// Public knowledge queries & semantic search
router.get('/articles', knowledgeController.getAllArticles);
router.get('/articles/:slug', knowledgeController.getArticleBySlug);
router.post('/search', knowledgeController.searchKnowledge);
router.post('/assistant', knowledgeController.askAssistant);

// Administrative article curation & knowledge publishing
router.post('/articles', authenticateToken, requireRole('admin'), knowledgeController.createArticle);
router.delete('/articles/:id', authenticateToken, requireRole('admin'), knowledgeController.deleteArticle);

module.exports = router;
