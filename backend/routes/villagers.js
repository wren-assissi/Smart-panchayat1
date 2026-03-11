const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, requirePanchayatRole, checkPanchayatAccess } = require('../middleware/auth');

// GET /api/villagers?panchayatId=X&search=name
router.get('/', authenticate, async (req, res) => {
  const { panchayatId, search } = req.query;
  if (!panchayatId) return res.status(400).json({ error: 'panchayatId required' });

  try {
    let query = `
      SELECT v.*, 
        COUNT(s.id) as sensor_count
      FROM villagers v
      LEFT JOIN sensors s ON s.villager_id = v.id
      WHERE v.panchayat_id = ?
    `;
    const params = [panchayatId];

    if (search) {
      query += ' AND v.name LIKE ?';
      params.push(`%${search}%`);
    }

    query += ' GROUP BY v.id ORDER BY v.name';

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/villagers/:id - single villager with sensors
router.get('/:id', authenticate, async (req, res) => {
  try {
    const [villager] = await db.query('SELECT * FROM villagers WHERE id=?', [req.params.id]);
    if (!villager.length) return res.status(404).json({ error: 'Villager not found' });

    const [sensors] = await db.query(
      'SELECT * FROM sensors WHERE villager_id=?',
      [req.params.id]
    );

    res.json({ ...villager[0], sensors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/villagers - create
router.post('/', authenticate, requirePanchayatRole, async (req, res) => {
  const { name, phone, address, panchayat_id } = req.body;
  if (!name || !panchayat_id) return res.status(400).json({ error: 'name and panchayat_id required' });

  // Ensure the panchayat belongs to the user
  if (req.user.role === 'panchayat' && req.user.location_id !== parseInt(panchayat_id)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO villagers (name, phone, address, panchayat_id) VALUES (?,?,?,?)',
      [name, phone || null, address || null, panchayat_id]
    );
    const [newVillager] = await db.query('SELECT * FROM villagers WHERE id=?', [result.insertId]);
    res.status(201).json(newVillager[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/villagers/:id - update
router.put('/:id', authenticate, requirePanchayatRole, async (req, res) => {
  const { name, phone, address } = req.body;
  try {
    // Verify villager belongs to user's panchayat
    const [existing] = await db.query('SELECT * FROM villagers WHERE id=?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: 'Villager not found' });

    if (req.user.location_id !== existing[0].panchayat_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await db.query(
      'UPDATE villagers SET name=?, phone=?, address=? WHERE id=?',
      [name || existing[0].name, phone ?? existing[0].phone, address ?? existing[0].address, req.params.id]
    );
    const [updated] = await db.query('SELECT * FROM villagers WHERE id=?', [req.params.id]);
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/villagers/:id
router.delete('/:id', authenticate, requirePanchayatRole, async (req, res) => {
  try {
    const [existing] = await db.query('SELECT * FROM villagers WHERE id=?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: 'Villager not found' });

    if (req.user.location_id !== existing[0].panchayat_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await db.query('DELETE FROM villagers WHERE id=?', [req.params.id]);
    res.json({ message: 'Villager deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/villagers/search/phone?q=9847
router.get('/search/phone', authenticate, async (req, res) => {
  const { q, panchayatId } = req.query;
  if (!q || q.length < 3) return res.json([]);

  try {
    const [rows] = await db.query(
      `SELECT id, name, phone FROM villagers 
       WHERE phone LIKE ? AND panchayat_id = ?
       ORDER BY name LIMIT 10`,
      [`%${q}%`, panchayatId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
