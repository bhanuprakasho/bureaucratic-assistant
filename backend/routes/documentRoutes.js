const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const documentController = require('../controllers/documentController');
const { authenticateToken, optionalAuth } = require('../middleware/authMiddleware');

// Ensure uploads folder exists privately
const uploadsDir = path.resolve(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage with safe server-generated filenames
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate secure random server controlled filename
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `doc-${uniqueSuffix}${ext}`);
  }
});

// File filter: accept images, PDFs, plain text
const fileFilter = (req, file, cb) => {
  const allowedMime = [
    'image/jpeg', 'image/png', 'image/webp', 'image/jpg',
    'application/pdf',
    'text/plain'
  ];
  if (allowedMime.includes(file.mimetype) || file.originalname.match(/\.(jpg|jpeg|png|webp|pdf|txt)$/i)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file format. Please upload JPG, PNG, WEBP, PDF, or TXT.'));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter
});

// Upload endpoint allows optional auth (or authenticated user)
router.post('/upload', optionalAuth, upload.single('document'), documentController.uploadDocument);

// Authenticated document management endpoints
router.get('/', authenticateToken, documentController.getUserDocuments);
router.get('/:id', authenticateToken, documentController.getDocumentById);
router.get('/:id/file', authenticateToken, documentController.downloadDocumentFile);
router.post('/:id/confirm', authenticateToken, documentController.confirmExtractedFields);
router.delete('/:id', authenticateToken, documentController.deleteDocument);

module.exports = router;
