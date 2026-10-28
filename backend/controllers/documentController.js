const { extractTextFromFile } = require('../services/ocrService');
const { classifyAndExtract } = require('../services/documentClassifier');
const { db } = require('../database/database');
const fs = require('fs');
const path = require('path');

// Helper to query DB with promises
const dbGet = (sql, params) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});
const dbAll = (sql, params) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});
const dbRun = (sql, params) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
});

// POST /api/documents/upload
exports.uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded. Please select a valid document.' });
    }

    const filePath = req.file.path;
    const mimeType = req.file.mimetype;
    const isSynthetic = req.body.is_synthetic === 'true' || req.body.is_synthetic === true ? 1 : 0;

    console.log(`Processing upload: ${req.file.originalname} (${req.file.size} bytes)`);

    // Step 1: Perform OCR / digital text extraction
    const rawText = await extractTextFromFile(filePath, mimeType);

    // Step 2: Classify and extract structured fields
    const classificationResult = classifyAndExtract(rawText);

    // Step 3: Determine user association
    // If user is authenticated, use req.user.id; fallback to demo citizen (id 1) if demo mode
    let userId = req.user ? req.user.id : 1;

    // Step 4: Persist in documents table
    const result = await dbRun(`
      INSERT INTO documents 
      (user_id, original_name, storage_filename, storage_path, mime_type, file_size, document_type, confidence, extracted_fields, raw_text, is_synthetic)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      req.file.originalname,
      req.file.filename,
      filePath,
      mimeType,
      req.file.size,
      classificationResult.documentType,
      classificationResult.confidence,
      JSON.stringify(classificationResult.extractedFields),
      rawText,
      isSynthetic
    ]);

    return res.status(201).json({
      success: true,
      documentId: result.lastID,
      filename: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      is_synthetic: isSynthetic === 1,
      result: classificationResult
    });

  } catch (error) {
    console.error('Document upload error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process document',
      error: error.message
    });
  }
};

// GET /api/documents - List documents for current user
exports.getUserDocuments = async (req, res) => {
  try {
    const userId = req.user.id;
    const isReviewerOrAdmin = ['reviewer', 'admin'].includes(req.user.role);

    let rows;
    if (isReviewerOrAdmin && req.query.all === 'true') {
      rows = await dbAll('SELECT id, user_id, original_name, mime_type, file_size, document_type, confidence, is_synthetic, created_at FROM documents ORDER BY created_at DESC');
    } else {
      rows = await dbAll('SELECT id, user_id, original_name, mime_type, file_size, document_type, confidence, is_synthetic, created_at FROM documents WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    }

    return res.json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch documents', error: error.message });
  }
};

// GET /api/documents/:id - Get single document details & extracted fields
exports.getDocumentById = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await dbGet('SELECT * FROM documents WHERE id = ?', [id]);

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    // Authorization & Ownership check
    const isOwner = req.user && req.user.id === doc.user_id;
    const isReviewerOrAdmin = req.user && ['reviewer', 'admin'].includes(req.user.role);

    if (!isOwner && !isReviewerOrAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to view this private document.'
      });
    }

    return res.json({
      success: true,
      data: {
        ...doc,
        extractedFields: JSON.parse(doc.extracted_fields || '{}')
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error retrieving document', error: error.message });
  }
};

// GET /api/documents/:id/file - Securely stream private file
exports.downloadDocumentFile = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await dbGet('SELECT * FROM documents WHERE id = ?', [id]);

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document file not found.' });
    }

    // Ownership check
    const isOwner = req.user && req.user.id === doc.user_id;
    const isReviewerOrAdmin = req.user && ['reviewer', 'admin'].includes(req.user.role);

    if (!isOwner && !isReviewerOrAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not authorized to download this private document.'
      });
    }

    // Prevent directory traversal
    const safeFilename = path.basename(doc.storage_filename);
    const resolvedPath = path.resolve(__dirname, '../uploads', safeFilename);

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ success: false, message: 'Physical file is no longer present on server.' });
    }

    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${doc.original_name.replace(/"/g, '')}"`);
    return fs.createReadStream(resolvedPath).pipe(res);

  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error streaming document file', error: error.message });
  }
};

// POST /api/documents/:id/confirm - Confirm / update extracted fields
exports.confirmExtractedFields = async (req, res) => {
  try {
    const { id } = req.params;
    const { confirmedFields, documentType } = req.body;

    const doc = await dbGet('SELECT * FROM documents WHERE id = ?', [id]);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    const isOwner = req.user && req.user.id === doc.user_id;
    const isReviewerOrAdmin = req.user && ['reviewer', 'admin'].includes(req.user.role);
    if (!isOwner && !isReviewerOrAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this document.' });
    }

    await dbRun(`
      UPDATE documents
      SET extracted_fields = ?, document_type = coalesce(?, document_type), confidence = 'Confirmed'
      WHERE id = ?
    `, [
      JSON.stringify(confirmedFields || {}),
      documentType,
      id
    ]);

    return res.json({
      success: true,
      message: 'Extracted fields updated and confirmed successfully.'
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update document fields', error: error.message });
  }
};

// DELETE /api/documents/:id - Delete record and disk file
exports.deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await dbGet('SELECT * FROM documents WHERE id = ?', [id]);

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    const isOwner = req.user && req.user.id === doc.user_id;
    const isReviewerOrAdmin = req.user && ['reviewer', 'admin'].includes(req.user.role);
    if (!isOwner && !isReviewerOrAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this document.' });
    }

    // Delete file from disk if exists
    const safeFilename = path.basename(doc.storage_filename);
    const resolvedPath = path.resolve(__dirname, '../uploads', safeFilename);
    if (fs.existsSync(resolvedPath)) {
      try {
        fs.unlinkSync(resolvedPath);
      } catch (err) {
        console.warn('Could not delete physical file:', err.message);
      }
    }

    await dbRun('DELETE FROM documents WHERE id = ?', [id]);

    return res.json({
      success: true,
      message: 'Document and associated file deleted successfully.'
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete document', error: error.message });
  }
};
