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

// GET /api/checklists/:serviceId
exports.getChecklistByService = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const userId = req.user.id;

    // Check if user already has saved checklist
    const existing = await dbGet('SELECT * FROM user_checklists WHERE user_id = ? AND service_id = ?', [userId, serviceId]);
    if (existing) {
      return res.json({
        success: true,
        isCustomized: true,
        data: {
          id: existing.id,
          serviceId: existing.service_id,
          serviceName: existing.service_name,
          items: JSON.parse(existing.items || '[]'),
          updatedAt: existing.updated_at
        }
      });
    }

    // Otherwise, generate from services table
    const service = await dbGet('SELECT * FROM services WHERE id = ?', [serviceId]);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Government service not found.' });
    }

    const reqDocs = JSON.parse(service.requiredDocuments || '[]');
    const defaultItems = reqDocs.map((docName, idx) => ({
      id: idx + 1,
      name: docName,
      required: true,
      checked: false,
      linkedDocId: null
    }));

    return res.json({
      success: true,
      isCustomized: false,
      data: {
        serviceId: service.id,
        serviceName: service.name,
        items: defaultItems
      }
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch checklist', error: error.message });
  }
};

// POST /api/checklists/:serviceId - Save or update checklist items
exports.saveChecklist = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { items, serviceName } = req.body;
    const userId = req.user.id;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'Items array is required.' });
    }

    // Lookup service name if not provided
    let sName = serviceName;
    if (!sName) {
      const s = await dbGet('SELECT name FROM services WHERE id = ?', [serviceId]);
      sName = s ? s.name : serviceId;
    }

    const now = new Date().toISOString();
    await dbRun(`
      INSERT INTO user_checklists (user_id, service_id, service_name, items, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, service_id) DO UPDATE SET
        items = excluded.items,
        updated_at = excluded.updated_at
    `, [userId, serviceId, sName, JSON.stringify(items), now]);

    return res.json({
      success: true,
      message: 'Checklist progress saved successfully.',
      updatedAt: now
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to save checklist', error: error.message });
  }
};

// GET /api/checklists - List all saved checklists for user
exports.getAllUserChecklists = async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = await dbAll('SELECT id, service_id, service_name, items, updated_at FROM user_checklists WHERE user_id = ? ORDER BY updated_at DESC', [userId]);

    const formatted = rows.map(r => {
      const items = JSON.parse(r.items || '[]');
      const completed = items.filter(i => i.checked).length;
      return {
        id: r.id,
        serviceId: r.service_id,
        serviceName: r.service_name,
        totalItems: items.length,
        completedItems: completed,
        percentComplete: items.length > 0 ? Math.round((completed / items.length) * 100) : 0,
        updatedAt: r.updated_at
      };
    });

    return res.json({
      success: true,
      count: formatted.length,
      data: formatted
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch user checklists', error: error.message });
  }
};
