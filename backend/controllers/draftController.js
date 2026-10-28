const { db } = require('../database/database');

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
});

// GET /api/drafts - List user's drafts
exports.getUserDrafts = async (req, res) => {
  try {
    const userId = req.user.id;
    const drafts = await dbAll('SELECT id, service_id, service_name, status, created_at, updated_at FROM application_drafts WHERE user_id = ? ORDER BY updated_at DESC', [userId]);
    return res.json({ success: true, count: drafts.length, data: drafts });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch application drafts', error: error.message });
  }
};

// GET /api/drafts/:id - Get specific draft
exports.getDraftById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const draft = await dbGet('SELECT * FROM application_drafts WHERE id = ?', [id]);

    if (!draft) {
      return res.status(404).json({ success: false, message: 'Application draft not found.' });
    }

    if (draft.user_id !== userId && !['reviewer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied: You do not own this application draft.' });
    }

    return res.json({
      success: true,
      data: {
        ...draft,
        formData: JSON.parse(draft.form_data || '{}')
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error retrieving draft', error: error.message });
  }
};

// POST /api/drafts - Create or save draft
exports.saveDraft = async (req, res) => {
  try {
    const { id, service_id, service_name, form_data, status } = req.body;
    const userId = req.user.id;

    if (!service_id || !form_data) {
      return res.status(400).json({ success: false, message: 'service_id and form_data are required.' });
    }

    const now = new Date().toISOString();

    if (id) {
      // Update existing draft with ownership check
      const existing = await dbGet('SELECT user_id FROM application_drafts WHERE id = ?', [id]);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Draft not found to update.' });
      }
      if (existing.user_id !== userId) {
        return res.status(403).json({ success: false, message: 'Not authorized to update this draft.' });
      }

      await dbRun(`
        UPDATE application_drafts
        SET form_data = ?, status = coalesce(?, status), updated_at = ?
        WHERE id = ?
      `, [JSON.stringify(form_data), status, now, id]);

      return res.json({
        success: true,
        message: 'Application draft updated successfully.',
        draftId: id
      });
    } else {
      // Create fresh draft
      const result = await dbRun(`
        INSERT INTO application_drafts (user_id, service_id, service_name, form_data, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [userId, service_id, service_name || service_id, JSON.stringify(form_data), status || 'draft', now, now]);

      return res.status(201).json({
        success: true,
        message: 'Application draft created successfully.',
        draftId: result.lastID
      });
    }

  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to save draft', error: error.message });
  }
};

// DELETE /api/drafts/:id
exports.deleteDraft = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const existing = await dbGet('SELECT user_id FROM application_drafts WHERE id = ?', [id]);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Draft not found.' });
    }
    if (existing.user_id !== userId && !['reviewer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this draft.' });
    }

    await dbRun('DELETE FROM application_drafts WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Application draft deleted successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete draft', error: error.message });
  }
};
