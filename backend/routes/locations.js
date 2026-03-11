const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

// GET /api/locations/districts - all districts
router.get('/districts', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, name FROM locations WHERE type='district' ORDER BY name"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/locations/blocks/:districtId
router.get('/blocks/:districtId', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, name FROM locations WHERE type='block' AND parent_id=? ORDER BY name",
      [req.params.districtId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/locations/panchayats/:blockId
router.get('/panchayats/:blockId', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, name FROM locations WHERE type='panchayat' AND parent_id=? ORDER BY name",
      [req.params.blockId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/locations/hierarchy - full accessible hierarchy for current user
router.get('/hierarchy', authenticate, async (req, res) => {
  const user = req.user;
  try {
    let districts = [];

    if (user.role === 'state') {
      const [rows] = await db.query("SELECT id, name FROM locations WHERE type='district' ORDER BY name");
      districts = rows;
    } else if (user.role === 'district') {
      const [rows] = await db.query("SELECT id, name FROM locations WHERE type='district' AND id=?", [user.location_id]);
      districts = rows;
    } else if (user.role === 'block') {
      const [rows] = await db.query(
        "SELECT d.id, d.name FROM locations d JOIN locations b ON b.parent_id=d.id WHERE b.id=?",
        [user.location_id]
      );
      districts = rows;
    } else if (user.role === 'panchayat') {
      const [rows] = await db.query(
        `SELECT d.id, d.name FROM locations d 
         JOIN locations b ON b.parent_id=d.id 
         JOIN locations p ON p.parent_id=b.id 
         WHERE p.id=?`,
        [user.location_id]
      );
      districts = rows;
    }

    res.json({ districts, userRole: user.role, userLocationId: user.location_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/locations/district-of-panchayat/:panchayatId
router.get('/district-of-panchayat/:panchayatId', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT d.id as district_id, d.name as district_name
       FROM locations p
       JOIN locations b ON b.id = p.parent_id
       JOIN locations d ON d.id = b.parent_id
       WHERE p.id = ? AND p.type = 'panchayat'`,
      [req.params.panchayatId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Panchayat not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
