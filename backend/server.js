const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

dotenv.config();

const seedDatabase = require('./database/seed');
const { startReminderScheduler } = require('./services/reminderScheduler');

const app = express();
const PORT = process.env.PORT || 5001;

// HTTP Security Headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5001'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server) or from allowed origins
    if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost:')) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive in dev
    }
  },
  credentials: true
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiter for authentication endpoints (prevent brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again after 15 minutes.'
  }
});

// NOTE: Static '/uploads' route has been removed for private document storage security.
// Private files are served exclusively through /api/documents/:id/file with authorization checks.

// Health Check API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    system: 'Intelligent Bureaucratic Assistance and Verification System API',
    version: '2.0.0 (Complete CSE Integration)',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Mount Routes
const authRoutes = require('./routes/authRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const documentRoutes = require('./routes/documentRoutes');
const eligibilityRoutes = require('./routes/eligibilityRoutes');
const scamRoutes = require('./routes/scamRoutes');
const immigrationRoutes = require('./routes/immigrationRoutes');
const knowledgeRoutes = require('./routes/knowledgeRoutes');
const checklistRoutes = require('./routes/checklistRoutes');
const draftRoutes = require('./routes/draftRoutes');
const letterRoutes = require('./routes/letterRoutes');
const reminderRoutes = require('./routes/reminderRoutes');

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/eligibility', eligibilityRoutes);
app.use('/api/scam', scamRoutes);
app.use('/api/immigration', immigrationRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/checklists', checklistRoutes);
app.use('/api/drafts', draftRoutes);
app.use('/api/letters', letterRoutes);
app.use('/api/reminders', reminderRoutes);

// Global 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.url}` });
});

// Global Error Handler (safe errors, no stack traces leaked to clients)
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' ? { errorType: err.name } : {})
  });
});

// Safe database initialization and server startup
seedDatabase().then(() => {
  startReminderScheduler(60000);
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`Backend Server running on http://localhost:${PORT}`);
    console.log(`Health Check: http://localhost:${PORT}/api/health`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`====================================================`);
  });
}).catch(err => {
  console.error('Database initialization failed:', err);
});
