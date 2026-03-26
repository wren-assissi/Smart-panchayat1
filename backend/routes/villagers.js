const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, requirePanchayatRole, checkPanchayatAccess } = require('../middleware/auth');

function parseLocationId(value) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

async function resolveVillagerScope(user, query) {
  const districtId = parseLocationId(query.districtId);
  const blockId = parseLocationId(query.blockId);
  const panchayatId = parseLocationId(query.panchayatId);

  if ((query.districtId && !districtId) || (query.blockId && !blockId) || (query.panchayatId && !panchayatId)) {
    const err = new Error('Invalid location filter');
    err.statusCode = 400;
    throw err;
  }

  if (panchayatId) {
    const [rows] = await db.query(
      `SELECT p.id as panchayat_id,
              b.id as block_id,
              d.id as district_id
       FROM locations p
       JOIN locations b ON b.id = p.parent_id
       JOIN locations d ON d.id = b.parent_id
       WHERE p.id = ? AND p.type = 'panchayat'`,
      [panchayatId]
    );

    if (!rows.length) {
      const err = new Error('Panchayat not found');
      err.statusCode = 404;
      throw err;
    }

    const location = rows[0];
    if ((blockId && location.block_id !== blockId) || (districtId && location.district_id !== districtId)) {
      const err = new Error('Selected panchayat does not belong to the chosen parent location');
      err.statusCode = 400;
      throw err;
    }
    if (user.role === 'district' && location.district_id !== user.location_id) {
      const err = new Error('Access denied: different district');
      err.statusCode = 403;
      throw err;
    }
    if (user.role === 'block' && location.block_id !== user.location_id) {
      const err = new Error('Access denied: different block');
      err.statusCode = 403;
      throw err;
    }
    if (user.role === 'panchayat' && location.panchayat_id !== user.location_id) {
      const err = new Error('Access denied: different panchayat');
      err.statusCode = 403;
      throw err;
    }

    return { clause: ' AND v.panchayat_id = ?', params: [location.panchayat_id] };
  }

  if (blockId) {
    const [rows] = await db.query(
      `SELECT b.id as block_id,
              d.id as district_id
       FROM locations b
       JOIN locations d ON d.id = b.parent_id
       WHERE b.id = ? AND b.type = 'block'`,
      [blockId]
    );

    if (!rows.length) {
      const err = new Error('Block not found');
      err.statusCode = 404;
      throw err;
    }

    const location = rows[0];
    if (districtId && location.district_id !== districtId) {
      const err = new Error('Selected block does not belong to the chosen district');
      err.statusCode = 400;
      throw err;
    }
    if (user.role === 'district' && location.district_id !== user.location_id) {
      const err = new Error('Access denied: different district');
      err.statusCode = 403;
      throw err;
    }
    if (user.role === 'block' && location.block_id !== user.location_id) {
      const err = new Error('Access denied: different block');
      err.statusCode = 403;
      throw err;
    }
    if (user.role === 'panchayat') {
      const err = new Error('Access denied');
      err.statusCode = 403;
      throw err;
    }

    return { clause: ' AND b.id = ?', params: [location.block_id] };
  }

  if (districtId) {
    const [rows] = await db.query(
      "SELECT id FROM locations WHERE id = ? AND type = 'district'",
      [districtId]
    );

    if (!rows.length) {
      const err = new Error('District not found');
      err.statusCode = 404;
      throw err;
    }

    if (user.role === 'district' && districtId !== user.location_id) {
      const err = new Error('Access denied: different district');
      err.statusCode = 403;
      throw err;
    }
    if (user.role === 'block' || user.role === 'panchayat') {
      const err = new Error('Access denied');
      err.statusCode = 403;
      throw err;
    }

    return { clause: ' AND d.id = ?', params: [districtId] };
  }

  if (user.role === 'panchayat') {
    return { clause: ' AND v.panchayat_id = ?', params: [user.location_id] };
  }
  if (user.role === 'block') {
    return { clause: ' AND b.id = ?', params: [user.location_id] };
  }
  if (user.role === 'district') {
    return { clause: ' AND d.id = ?', params: [user.location_id] };
  }

  return { clause: '', params: [] };
}

// GET /api/villagers?districtId=X&blockId=Y&panchayatId=Z&search=name
router.get('/', authenticate, async (req, res) => {
  const { search } = req.query;

  try {
    const { clause, params: scopeParams } = await resolveVillagerScope(req.user, req.query);
    let query = `
      SELECT v.*, 
        COUNT(s.id) as sensor_count
      FROM villagers v
      LEFT JOIN locations p ON p.id = v.panchayat_id
      LEFT JOIN locations b ON b.id = p.parent_id
      LEFT JOIN locations d ON d.id = b.parent_id
      LEFT JOIN sensors s ON s.villager_id = v.id
      WHERE 1=1 ${clause}
    `;
    const params = [...scopeParams];

    if (search) {
      query += ' AND v.name LIKE ?';
      params.push(`%${search}%`);
    }

    query += ' GROUP BY v.id ORDER BY v.name';

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
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
