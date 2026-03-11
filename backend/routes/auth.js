const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
require('dotenv').config();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const [rows] = await db.query(
      `SELECT u.*, l.name as location_name, l.type as location_type
       FROM users u
       LEFT JOIN locations l ON l.id = u.location_id
       WHERE u.username = ?`,
      [username]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      location_id: user.location_id,
      location_name: user.location_name,
      location_type: user.location_type,
      full_name: user.full_name,
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    });

    res.json({
      token,
      user: tokenPayload,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth').authenticate, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
