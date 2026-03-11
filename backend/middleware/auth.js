const jwt = require('jsonwebtoken');
require('dotenv').config();

const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Only panchayat-level users can write
const requirePanchayatRole = (req, res, next) => {
  if (req.user.role !== 'panchayat') {
    return res.status(403).json({ error: 'Only panchayat-level users can perform this action' });
  }
  next();
};

// Check user has access to this panchayat
const checkPanchayatAccess = async (req, res, next) => {
  const db = require('../config/db');
  const { panchayatId } = req.params;
  const user = req.user;

  if (user.role === 'state') return next(); // state sees all

  try {
    // Get panchayat's ancestry
    const [rows] = await db.query(
      `SELECT l.id, l.name, l.type, l.parent_id,
              b.id as block_id, d.id as district_id
       FROM locations l
       JOIN locations b ON b.id = l.parent_id
       JOIN locations d ON d.id = b.parent_id
       WHERE l.id = ? AND l.type = 'panchayat'`,
      [panchayatId]
    );

    if (!rows.length) return res.status(404).json({ error: 'Panchayat not found' });

    const p = rows[0];

    if (user.role === 'district' && user.location_id !== p.district_id) {
      return res.status(403).json({ error: 'Access denied: different district' });
    }
    if (user.role === 'block' && user.location_id !== p.block_id) {
      return res.status(403).json({ error: 'Access denied: different block' });
    }
    if (user.role === 'panchayat' && user.location_id !== parseInt(panchayatId)) {
      return res.status(403).json({ error: 'Access denied: different panchayat' });
    }

    req.panchayatInfo = p;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { authenticate, requirePanchayatRole, checkPanchayatAccess };
