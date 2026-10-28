const { db } = require('../database/database');

// GET /api/services - Fetch all government services
exports.getAllServices = (req, res) => {
  db.all('SELECT * FROM services', [], (err, rows) => {
    if (err) {
      console.error('Error fetching services:', err.message);
      return res.status(500).json({ error: 'Database query failed' });
    }

    // Parse JSON string arrays
    const formattedServices = rows.map(row => ({
      ...row,
      requiredDocuments: JSON.parse(row.requiredDocuments || '[]'),
      steps: JSON.parse(row.steps || '[]')
    }));

    res.json({
      success: true,
      count: formattedServices.length,
      data: formattedServices
    });
  });
};

// GET /api/services/:id - Fetch single service by ID
exports.getServiceById = (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM services WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Error fetching service:', err.message);
      return res.status(500).json({ error: 'Database query failed' });
    }

    if (!row) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const formattedService = {
      ...row,
      requiredDocuments: JSON.parse(row.requiredDocuments || '[]'),
      steps: JSON.parse(row.steps || '[]')
    };

    res.json({
      success: true,
      data: formattedService
    });
  });
};
