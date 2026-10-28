const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../database/database');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_bureaucratic_system_secure_key_2026_vit_cse';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { username, email, password, full_name } = req.body;

    if (!username || !email || !password || !full_name) {
      return res.status(400).json({
        success: false,
        message: 'All fields (username, email, password, full_name) are required.'
      });
    }

    const trimmedUser = username.trim().toLowerCase();
    const trimmedEmail = email.trim().toLowerCase();

    if (trimmedUser.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Username must be at least 3 characters long.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.'
      });
    }

    // Role is always 'citizen' for public registration (prevent privilege escalation)
    const role = 'citizen';

    // Check if username or email already exists
    db.get('SELECT id FROM users WHERE username = ? OR email = ?', [trimmedUser, trimmedEmail], async (err, existing) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Database error checking existing user.' });
      }

      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'A user with this username or email already exists.'
        });
      }

      const password_hash = await bcrypt.hash(password, 10);

      db.run(
        `INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)`,
        [trimmedUser, trimmedEmail, password_hash, full_name.trim(), role],
        function (insertErr) {
          if (insertErr) {
            return res.status(500).json({ success: false, message: 'Failed to create user account.' });
          }

          const userId = this.lastID;
          const user = { id: userId, username: trimmedUser, email: trimmedEmail, full_name: full_name.trim(), role };
          const token = jwt.sign({ id: userId, username: trimmedUser, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

          return res.status(201).json({
            success: true,
            message: 'User registered successfully.',
            token,
            user
          });
        }
      );
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Internal server error during registration.' });
  }
};

// POST /api/auth/login
exports.login = (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Username and password are required.'
    });
  }

  const lookup = username.trim().toLowerCase();

  db.get('SELECT * FROM users WHERE username = ? OR email = ?', [lookup, lookup], async (err, user) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database query error during login.' });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. User not found.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Incorrect password.'
      });
    }

    const safeUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      role: user.role
    };

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: safeUser
    });
  });
};

// GET /api/auth/me
exports.getMe = (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }

  return res.json({
    success: true,
    user: req.user
  });
};

// POST /api/auth/logout
exports.logout = (req, res) => {
  // Stateless JWT tokens are cleared client-side
  return res.json({
    success: true,
    message: 'Logged out successfully.'
  });
};
