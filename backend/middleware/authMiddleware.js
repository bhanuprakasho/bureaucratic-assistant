const jwt = require('jsonwebtoken');
const { db } = require('../database/database');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_bureaucratic_system_secure_key_2026_vit_cse';

/**
 * Verifies JWT bearer token and attaches user profile to request.
 * Strictly disallows unauthenticated fallback or fake demo tokens.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No authorization header provided. Please log in.'
    });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Authorization header format must be Bearer <token>.'
    });
  }

  const token = parts[1];

  // Strictly reject demo token string hacks
  if (token === 'demo-token' || token.startsWith('demo-')) {
    return res.status(401).json({
      success: false,
      message: 'Demo bypass tokens are not permitted. Please log in with valid credentials.'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Session has expired. Please log in again.'
        });
      }
      return res.status(403).json({
        success: false,
        message: 'Invalid or tampered token. Access forbidden.'
      });
    }

    // Verify user still exists in database
    db.get('SELECT id, username, email, full_name, role FROM users WHERE id = ?', [decoded.id], (dbErr, user) => {
      if (dbErr || !user) {
        return res.status(401).json({
          success: false,
          message: 'Authenticated user account no longer exists.'
        });
      }

      req.user = user;
      next();
    });
  });
}

/**
 * Role-Based Access Control Middleware.
 * Enforces server-side authorization independent of client state.
 * @param  {...string} roles - e.g. 'admin', 'reviewer', 'citizen'
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required before checking role authorization.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: This operation requires one of [${roles.join(', ')}] roles. Your current role is '${req.user.role}'.`
      });
    }

    next();
  };
}

/**
 * Optional authentication middleware for public endpoints that can personalize content if logged in.
 * Never grants elevated reviewer/admin privileges when unauthenticated.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    req.user = null;
    return next();
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    req.user = null;
    return next();
  }

  const token = parts[1];
  if (token === 'demo-token' || token.startsWith('demo-')) {
    req.user = null;
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err || !decoded) {
      req.user = null;
      return next();
    }

    db.get('SELECT id, username, email, full_name, role FROM users WHERE id = ?', [decoded.id], (dbErr, user) => {
      req.user = user || null;
      next();
    });
  });
}

module.exports = {
  authenticateToken,
  requireRole,
  optionalAuth
};
