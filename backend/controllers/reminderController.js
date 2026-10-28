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

// GET /api/reminders - Get user's reminders with overdue / upcoming calculations
exports.getUserReminders = async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = await dbAll('SELECT * FROM reminders WHERE user_id = ? ORDER BY due_date ASC', [userId]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const formatted = rows.map(r => {
      const dueDate = new Date(r.due_date);
      dueDate.setHours(0, 0, 0, 0);
      const diffTime = dueDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let timingStatus = 'UPCOMING';
      if (diffDays < 0) {
        timingStatus = 'OVERDUE';
      } else if (diffDays === 0) {
        timingStatus = 'DUE_TODAY';
      }

      return {
        ...r,
        daysRemaining: diffDays,
        timingStatus,
        isOverdue: diffDays < 0 && r.status === 'ACTIVE'
      };
    });

    return res.json({
      success: true,
      count: formatted.length,
      data: formatted
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch reminders', error: error.message });
  }
};

// POST /api/reminders - Create reminder
exports.createReminder = async (req, res) => {
  try {
    const { title, due_date, service_id, document_name, notes, notification_type } = req.body;
    const userId = req.user.id;

    if (!title || !due_date) {
      return res.status(400).json({ success: false, message: 'Title and due_date (YYYY-MM-DD) are required.' });
    }

    const result = await dbRun(`
      INSERT INTO reminders (user_id, title, service_id, document_name, due_date, status, notification_type, notes)
      VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
    `, [
      userId,
      title.trim(),
      service_id || null,
      document_name || null,
      due_date,
      notification_type || 'IN_APP',
      notes || null
    ]);

    return res.status(201).json({
      success: true,
      message: 'Reminder scheduled successfully.',
      reminderId: result.lastID
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create reminder', error: error.message });
  }
};

// PATCH /api/reminders/:id - Update status or due date
exports.updateReminder = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, due_date, notes, title } = req.body;
    const userId = req.user.id;

    const existing = await dbGet('SELECT * FROM reminders WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Reminder not found.' });
    }
    if (existing.user_id !== userId && !['reviewer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized to modify this reminder.' });
    }

    await dbRun(`
      UPDATE reminders
      SET status = coalesce(?, status),
          due_date = coalesce(?, due_date),
          notes = coalesce(?, notes),
          title = coalesce(?, title)
      WHERE id = ?
    `, [status, due_date, notes, title, id]);

    return res.json({ success: true, message: 'Reminder updated successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update reminder', error: error.message });
  }
};

// DELETE /api/reminders/:id
exports.deleteReminder = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existing = await dbGet('SELECT user_id FROM reminders WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Reminder not found.' });
    }
    if (existing.user_id !== userId && !['reviewer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this reminder.' });
    }

    await dbRun('DELETE FROM reminders WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Reminder deleted successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete reminder', error: error.message });
  }
};
