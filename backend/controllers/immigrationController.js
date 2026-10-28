const { db } = require('../database/database');
const { runScreeningAnalysis } = require('../services/immigrationVerificationService');

// Promise helpers
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
});

// POST /api/immigration/cases - Create new immigration screening case
exports.createCase = async (req, res) => {
  try {
    const { applicant_name, applicant_email, category } = req.body;

    if (!applicant_name || applicant_name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Applicant name is required.' });
    }

    const caseNumber = `CASE-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const creatorId = req.user.id;

    const result = await dbRun(`
      INSERT INTO immigration_cases 
      (case_number, applicant_name, applicant_email, category, status, creator_id)
      VALUES (?, ?, ?, ?, 'PENDING_REVIEW', ?)
    `, [caseNumber, applicant_name.trim(), applicant_email || null, category || 'Identity Screening', creatorId]);

    const caseId = result.lastID;

    // Log audit event
    await dbRun(`
      INSERT INTO audit_logs (case_id, user_id, action, details, ip_address)
      VALUES (?, ?, 'CASE_CREATED', ?, ?)
    `, [caseId, creatorId, JSON.stringify({ caseNumber, applicant_name }), req.ip || '127.0.0.1']);

    return res.status(201).json({
      success: true,
      message: 'Immigration screening case created successfully.',
      caseId,
      caseNumber
    });
  } catch (error) {
    console.error('Error creating immigration case:', error);
    return res.status(500).json({ success: false, message: 'Failed to create case', error: error.message });
  }
};

// GET /api/immigration/cases - List cases
exports.listCases = async (req, res) => {
  try {
    const isReviewerOrAdmin = ['reviewer', 'admin'].includes(req.user.role);
    let cases;

    if (isReviewerOrAdmin) {
      cases = await dbAll(`
        SELECT c.*, u.full_name as creator_name, r.full_name as reviewer_name,
               (SELECT count(*) FROM case_flags f WHERE f.case_id = c.id AND f.status = 'ACTIVE') as active_flags_count
        FROM immigration_cases c
        LEFT JOIN users u ON c.creator_id = u.id
        LEFT JOIN users r ON c.assigned_reviewer_id = r.id
        ORDER BY c.created_at DESC
      `);
    } else {
      cases = await dbAll(`
        SELECT c.*, u.full_name as creator_name,
               (SELECT count(*) FROM case_flags f WHERE f.case_id = c.id AND f.status = 'ACTIVE') as active_flags_count
        FROM immigration_cases c
        LEFT JOIN users u ON c.creator_id = u.id
        WHERE c.creator_id = ?
        ORDER BY c.created_at DESC
      `, [req.user.id]);
    }

    return res.json({
      success: true,
      count: cases.length,
      data: cases
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve cases', error: error.message });
  }
};

// GET /api/immigration/cases/:id - Get case details, attached documents, flags, and audit
exports.getCaseById = async (req, res) => {
  try {
    const { id } = req.params;
    const caseData = await dbGet(`
      SELECT c.*, u.full_name as creator_name, r.full_name as reviewer_name
      FROM immigration_cases c
      LEFT JOIN users u ON c.creator_id = u.id
      LEFT JOIN users r ON c.assigned_reviewer_id = r.id
      WHERE c.id = ?
    `, [id]);

    if (!caseData) {
      return res.status(404).json({ success: false, message: 'Case not found.' });
    }

    // Role & Ownership check
    const isOwner = req.user.id === caseData.creator_id;
    const isReviewerOrAdmin = ['reviewer', 'admin'].includes(req.user.role);

    if (!isOwner && !isReviewerOrAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied: You do not own this immigration case.' });
    }

    // Fetch linked documents
    const documents = await dbAll(`
      SELECT cd.id as link_id, cd.doc_role, d.*
      FROM case_documents cd
      JOIN documents d ON cd.document_id = d.id
      WHERE cd.case_id = ?
    `, [id]);

    const parsedDocuments = documents.map(d => ({
      ...d,
      extractedFields: JSON.parse(d.extracted_fields || '{}')
    }));

    // Fetch flags
    const flags = await dbAll(`
      SELECT * FROM case_flags WHERE case_id = ? ORDER BY severity DESC, created_at DESC
    `, [id]);

    // Fetch audit trail
    const auditLogs = await dbAll(`
      SELECT a.*, u.full_name as actor_name, u.role as actor_role
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.case_id = ?
      ORDER BY a.created_at DESC
    `, [id]);

    return res.json({
      success: true,
      data: {
        case: caseData,
        documents: parsedDocuments,
        flags,
        auditLogs
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error retrieving case details', error: error.message });
  }
};

// POST /api/immigration/cases/:id/documents - Link document to case & run automated screening
exports.linkDocumentToCase = async (req, res) => {
  try {
    const { id } = req.params;
    const { document_id, doc_role } = req.body;

    if (!document_id) {
      return res.status(400).json({ success: false, message: 'Document ID is required.' });
    }

    const caseData = await dbGet('SELECT * FROM immigration_cases WHERE id = ?', [id]);
    if (!caseData) {
      return res.status(404).json({ success: false, message: 'Case not found.' });
    }

    // Ownership or reviewer check
    const isOwner = req.user.id === caseData.creator_id;
    const isReviewerOrAdmin = ['reviewer', 'admin'].includes(req.user.role);
    if (!isOwner && !isReviewerOrAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to modify this case.' });
    }

    // Check document exists
    const doc = await dbGet('SELECT * FROM documents WHERE id = ?', [document_id]);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document record not found.' });
    }

    // Insert link
    await dbRun(`
      INSERT INTO case_documents (case_id, document_id, doc_role)
      VALUES (?, ?, ?)
    `, [id, document_id, doc_role || 'SUPPORTING_ID']);

    // Log link audit
    await dbRun(`
      INSERT INTO audit_logs (case_id, user_id, action, details, ip_address)
      VALUES (?, ?, 'DOCUMENT_LINKED', ?, ?)
    `, [id, req.user.id, JSON.stringify({ documentId: document_id, docName: doc.original_name, role: doc_role }), req.ip || '127.0.0.1']);

    // Re-run screening analysis on all linked documents
    const allLinkedDocs = await dbAll(`
      SELECT d.*, cd.doc_role
      FROM case_documents cd
      JOIN documents d ON cd.document_id = d.id
      WHERE cd.case_id = ?
    `, [id]);

    const parsedDocs = allLinkedDocs.map(d => ({
      ...d,
      extractedFields: JSON.parse(d.extracted_fields || '{}')
    }));

    const analysis = runScreeningAnalysis(parsedDocs);

    // Save discovered flags into case_flags (avoid duplicating identical active flag_code)
    for (const f of analysis.flags) {
      const existing = await dbGet('SELECT id FROM case_flags WHERE case_id = ? AND flag_code = ? AND status = "ACTIVE"', [id, f.flag_code]);
      if (!existing) {
        await dbRun(`
          INSERT INTO case_flags (case_id, flag_code, severity, title, description, evidence, status)
          VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
        `, [id, f.flag_code, f.severity, f.title, f.description, f.evidence]);
      }
    }

    // Log screening execution
    await dbRun(`
      INSERT INTO audit_logs (case_id, user_id, action, details, ip_address)
      VALUES (?, ?, 'AUTOMATED_SCREENING_EXECUTED', ?, ?)
    `, [id, req.user.id, JSON.stringify({ overallRisk: analysis.overallRisk, flagsGenerated: analysis.flags.length }), req.ip || '127.0.0.1']);

    return res.json({
      success: true,
      message: 'Document attached and screening analysis updated.',
      analysis
    });

  } catch (error) {
    console.error('Error linking document:', error);
    return res.status(500).json({ success: false, message: 'Failed to link document', error: error.message });
  }
};

// PATCH /api/immigration/cases/:id/flags/:flagId - Update flag status (Reviewer/Admin only)
exports.updateFlagStatus = async (req, res) => {
  try {
    const { id, flagId } = req.params;
    const { status, reviewer_comment } = req.body;

    if (!['ACTIVE', 'DISMISSED', 'RESOLVED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Must be ACTIVE, DISMISSED, or RESOLVED.' });
    }

    const flag = await dbGet('SELECT * FROM case_flags WHERE id = ? AND case_id = ?', [flagId, id]);
    if (!flag) {
      return res.status(404).json({ success: false, message: 'Flag not found on this case.' });
    }

    await dbRun(`
      UPDATE case_flags
      SET status = ?, reviewer_comment = coalesce(?, reviewer_comment)
      WHERE id = ?
    `, [status, reviewer_comment, flagId]);

    // Log audit event
    await dbRun(`
      INSERT INTO audit_logs (case_id, user_id, action, details, ip_address)
      VALUES (?, ?, 'FLAG_STATUS_UPDATED', ?, ?)
    `, [id, req.user.id, JSON.stringify({ flagId, flagCode: flag.flag_code, oldStatus: flag.status, newStatus: status, comment: reviewer_comment }), req.ip || '127.0.0.1']);

    return res.json({
      success: true,
      message: `Flag ${flag.flag_code} marked as ${status}.`
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update flag', error: error.message });
  }
};

// POST /api/immigration/cases/:id/decision - Record formal reviewer conclusion (Reviewer/Admin only)
exports.recordDecision = async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, notes } = req.body;

    if (!['APPROVED', 'REJECTED', 'REQUIRES_MORE_INFO'].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid decision. Must be APPROVED, REJECTED, or REQUIRES_MORE_INFO.'
      });
    }

    const caseData = await dbGet('SELECT * FROM immigration_cases WHERE id = ?', [id]);
    if (!caseData) {
      return res.status(404).json({ success: false, message: 'Case not found.' });
    }

    const now = new Date().toISOString();
    await dbRun(`
      UPDATE immigration_cases
      SET status = ?, reviewer_decision = ?, reviewer_notes = ?, decision_date = ?, assigned_reviewer_id = ?, updated_at = ?
      WHERE id = ?
    `, [decision, decision, notes || '', now, req.user.id, now, id]);

    // Log audit
    await dbRun(`
      INSERT INTO audit_logs (case_id, user_id, action, details, ip_address)
      VALUES (?, ?, 'REVIEWER_DECISION_RECORDED', ?, ?)
    `, [id, req.user.id, JSON.stringify({ decision, notes, reviewerName: req.user.full_name }), req.ip || '127.0.0.1']);

    return res.json({
      success: true,
      message: `Case review decision recorded: ${decision}.`,
      status: decision,
      decisionDate: now
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to record decision', error: error.message });
  }
};
