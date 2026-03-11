const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { queryApi } = require('../config/influx');
const { authenticate, requirePanchayatRole } = require('../middleware/auth');

function buildScopeClause(user) {
  if (user.role === 'panchayat') {
    return { clause: ' AND s.panchayat_id = ?', params: [user.location_id] };
  }
  if (user.role === 'block') {
    return { clause: ' AND lb.id = ?', params: [user.location_id] };
  }
  if (user.role === 'district') {
    return { clause: ' AND ld.id = ?', params: [user.location_id] };
  }
  return { clause: '', params: [] };
}

async function getLatestReadingsForSensors(sensors) {
  if (!sensors.length) return {};

  const readings = {};

  await Promise.all(sensors.map(async (sensor) => {
    const measurement = `${sensor.district_name}_${sensor.type}`;
    try {
      const fluxQuery = `
        from(bucket: "${process.env.INFLUX_BUCKET || 'sensor_data'}")
          |> range(start: -1h)
          |> filter(fn: (r) => r._measurement == "${measurement}")
          |> filter(fn: (r) => r.sensor_id == "${sensor.id}")
          |> last()
      `;

      await new Promise((resolve) => {
        queryApi.queryRows(fluxQuery, {
          next(row, tableMeta) {
            const obj = tableMeta.toObject(row);
            const value = Number(obj._value);
            if (!Number.isNaN(value)) readings[sensor.id] = value;
          },
          error() { resolve(); },
          complete() { resolve(); },
        });
      });
    } catch {}
  }));

  return readings;
}

function formatAverages(typeMap) {
  return [...typeMap.entries()]
    .map(([sensorType, stats]) => ({
      sensorType,
      average: Number((stats.sum / stats.count).toFixed(2)),
      count: stats.count,
    }))
    .sort((a, b) => a.sensorType.localeCompare(b.sensorType));
}

function aggregateSensors(sensors, readings, groupingKey) {
  const groups = new Map();
  const resolveGroupId = typeof groupingKey === 'function'
    ? groupingKey
    : (sensor) => sensor[groupingKey];
  const resolveGroupName = typeof groupingKey === 'function'
    ? null
    : groupingKey.replace('_id', '_name');

  for (const sensor of sensors) {
    const reading = readings[sensor.id];
    if (reading == null || Number.isNaN(reading)) continue;

    const groupId = resolveGroupId(sensor);
    if (!groupId) continue;

    if (!groups.has(groupId)) {
      groups.set(groupId, {
        id: groupId,
        name: resolveGroupName ? sensor[resolveGroupName] : undefined,
        averages: new Map(),
      });
    }

    const group = groups.get(groupId);
    const stats = group.averages.get(sensor.type) || { sum: 0, count: 0 };
    stats.sum += reading;
    stats.count += 1;
    group.averages.set(sensor.type, stats);
  }

  return groups;
}

// GET /api/sensors?panchayatId=X&search=id&type=Temp
router.get('/', authenticate, async (req, res) => {
  const { panchayatId, search, type } = req.query;
  if (!panchayatId) return res.status(400).json({ error: 'panchayatId required' });

  try {
    let query = `
      SELECT s.id, s.name, s.type, s.status, s.location_description,
        ST_X(s.location) as latitude,
        ST_Y(s.location) as longitude,
        s.panchayat_id, s.villager_id, s.district_id,
        s.installed_at, s.updated_at,
        v.name as villager_name,
        ld.name as district_name
      FROM sensors s
      LEFT JOIN villagers v ON v.id = s.villager_id
      LEFT JOIN locations ld ON ld.id = s.district_id
      WHERE s.panchayat_id = ?
    `;
    const params = [panchayatId];

    if (search) {
      query += ' AND s.id LIKE ?';
      params.push(`%${search}%`);
    }
    if (type) {
      query += ' AND s.type = ?';
      params.push(type);
    }

    query += ' ORDER BY s.id';

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sensors/map?type=Temp
// Returns sensors filtered by type and user's access level with lat/lng
router.get('/map/pins', authenticate, async (req, res) => {
  const { type } = req.query;
  const user = req.user;

  if (!type) return res.status(400).json({ error: 'type is required' });

  try {
    let query = `
      SELECT s.id, s.name, s.type, s.status,
        ST_X(s.location) as latitude,
        ST_Y(s.location) as longitude,
        s.location_description,
        s.panchayat_id, s.district_id,
        v.name as villager_name,
        lp.name as panchayat_name,
        lb.name as block_name,
        ld.name as district_name
      FROM sensors s
      LEFT JOIN villagers v ON v.id = s.villager_id
      LEFT JOIN locations lp ON lp.id = s.panchayat_id
      LEFT JOIN locations lb ON lb.id = lp.parent_id
      LEFT JOIN locations ld ON ld.id = lb.parent_id
      WHERE s.type = ?
    `;
    const params = [type];

    if (user.role === 'panchayat') {
      query += ' AND s.panchayat_id = ?';
      params.push(user.location_id);
    } else if (user.role === 'block') {
      query += ' AND lb.id = ?';
      params.push(user.location_id);
    } else if (user.role === 'district') {
      query += ' AND ld.id = ?';
      params.push(user.location_id);
    }
    // state sees all — no extra filter

    query += ' AND s.status != \'faulty\' ORDER BY s.id';

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Map pins query failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sensors/map/readings
// Body: { sensorIds: [], type: 'Temp', districtName: 'Thrissur' }
router.post('/map/readings', authenticate, async (req, res) => {
  const { sensors } = req.body; // [{ id, type, district_name }]
  if (!sensors || !sensors.length) return res.json({});

  const rawReadings = await getLatestReadingsForSensors(sensors);
  const readings = Object.fromEntries(
    Object.entries(rawReadings).map(([sensorId, value]) => [sensorId, Number(value.toFixed(2))])
  );
  res.json(readings);
});

// GET /api/sensors/aggregate/report
router.get('/aggregate/report', authenticate, async (req, res) => {
  const user = req.user;

  try {
    const { clause, params } = buildScopeClause(user);
    const [sensors] = await db.query(
      `SELECT s.id, s.type,
        lp.id as panchayat_id, lp.name as panchayat_name,
        lb.id as block_id, lb.name as block_name,
        ld.id as district_id, ld.name as district_name
       FROM sensors s
       LEFT JOIN locations lp ON lp.id = s.panchayat_id
       LEFT JOIN locations lb ON lb.id = lp.parent_id
       LEFT JOIN locations ld ON ld.id = lb.parent_id
       WHERE 1=1 ${clause} AND s.status != 'faulty'`,
      params
    );

    const readings = await getLatestReadingsForSensors(sensors);
    const scopeType = user.role === 'state' ? 'state' : user.role;
    const scopeName = user.role === 'state' ? 'Kerala' : user.location_name;

    const overallTypeMap = new Map();
    for (const sensor of sensors) {
      const reading = readings[sensor.id];
      if (reading == null || Number.isNaN(reading)) continue;

      const stats = overallTypeMap.get(sensor.type) || { sum: 0, count: 0 };
      stats.sum += reading;
      stats.count += 1;
      overallTypeMap.set(sensor.type, stats);
    }

    let childLevel = null;
    let childGroups = [];
    let childLocations = [];

    if (user.role === 'state') {
      childLevel = 'district';
      const [rows] = await db.query(
        "SELECT id, name FROM locations WHERE type='district' ORDER BY name"
      );
      childLocations = rows;
    } else if (user.role === 'district') {
      childLevel = 'block';
      const [rows] = await db.query(
        "SELECT id, name FROM locations WHERE type='block' AND parent_id=? ORDER BY name",
        [user.location_id]
      );
      childLocations = rows;
    } else if (user.role === 'block') {
      childLevel = 'panchayat';
      const [rows] = await db.query(
        "SELECT id, name FROM locations WHERE type='panchayat' AND parent_id=? ORDER BY name",
        [user.location_id]
      );
      childLocations = rows;
    }

    if (childLevel) {
      const groupedReadings = aggregateSensors(sensors, readings, `${childLevel}_id`);
      childGroups = childLocations.map((location) => {
        const group = groupedReadings.get(location.id);
        return {
          id: location.id,
          name: location.name,
          level: childLevel,
          averages: group ? formatAverages(group.averages) : [],
        };
      });
    }

    res.json({
      generatedAt: new Date().toISOString(),
      scope: {
        level: scopeType,
        name: scopeName,
        averages: formatAverages(overallTypeMap),
      },
      childLevel,
      children: childGroups,
    });
  } catch (err) {
    console.error('Aggregate report query failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sensors/stats/:panchayatId - dashboard stats
// NOTE: must be before /:id to avoid conflict
router.get('/stats/:panchayatId', authenticate, async (req, res) => {
  try {
    const [sensorStats] = await db.query(
      `SELECT
        COUNT(*) as total,
        SUM(status='active') as active,
        SUM(status='inactive') as inactive,
        SUM(status='faulty') as faulty
       FROM sensors WHERE panchayat_id=?`,
      [req.params.panchayatId]
    );
    const [villagerCount] = await db.query(
      'SELECT COUNT(*) as total FROM villagers WHERE panchayat_id=?',
      [req.params.panchayatId]
    );

    res.json({
      sensors: sensorStats[0],
      villagers: villagerCount[0].total,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sensors/:id - sensor detail + latest reading
router.get('/:id', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.id, s.name, s.type, s.status, s.location_description,
        ST_X(s.location) as latitude,
        ST_Y(s.location) as longitude,
        s.panchayat_id, s.villager_id, s.district_id,
        s.installed_at, s.updated_at,
        v.name as villager_name,
        ld.name as district_name
       FROM sensors s
       LEFT JOIN villagers v ON v.id = s.villager_id
       LEFT JOIN locations ld ON ld.id = s.district_id
       WHERE s.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Sensor not found' });

    const sensor = rows[0];

    // Fetch latest reading from InfluxDB
    const measurement = `${sensor.district_name}_${sensor.type}`;
    let latestReading = null;

    try {
      const fluxQuery = `
        from(bucket: "${process.env.INFLUX_BUCKET || 'sensor_data'}")
          |> range(start: -1h)
          |> filter(fn: (r) => r._measurement == "${measurement}")
          |> filter(fn: (r) => r.sensor_id == "${sensor.id}")
          |> last()
      `;

      const results = [];
      await new Promise((resolve) => {
        queryApi.queryRows(fluxQuery, {
          next(row, tableMeta) {
            results.push(tableMeta.toObject(row));
          },
          error() { resolve(); },
          complete() { resolve(); },
        });
      });

      if (results.length > 0) {
        latestReading = {
          value: results[0]._value,
          time: results[0]._time,
          field: results[0]._field,
        };
      }
    } catch (influxErr) {
      console.warn('InfluxDB query error:', influxErr.message);
    }

    res.json({ ...sensor, latestReading });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sensors/:id/history?range=1h
router.get('/:id/history', authenticate, async (req, res) => {
  const { range = '24h' } = req.query;

  try {
    const [rows] = await db.query(
      `SELECT s.id, s.type, ld.name as district_name
       FROM sensors s
       LEFT JOIN locations ld ON ld.id = s.district_id
       WHERE s.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Sensor not found' });

    const sensor = rows[0];
    const measurement = `${sensor.district_name}_${sensor.type}`;

    const fluxQuery = `
      from(bucket: "${process.env.INFLUX_BUCKET || 'sensor_data'}")
        |> range(start: -${range})
        |> filter(fn: (r) => r._measurement == "${measurement}")
        |> filter(fn: (r) => r.sensor_id == "${req.params.id}")
        |> sort(columns: ["_time"])
    `;

    const results = [];
    await new Promise((resolve) => {
      queryApi.queryRows(fluxQuery, {
        next(row, tableMeta) {
          const obj = tableMeta.toObject(row);
          results.push({ time: obj._time, value: obj._value, field: obj._field });
        },
        error() { resolve(); },
        complete() { resolve(); },
      });
    });

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sensors
router.post('/', authenticate, requirePanchayatRole, async (req, res) => {
  const { id, name, type, status, location_description, latitude, longitude, panchayat_id, villager_id, district_id } = req.body;

  if (!id || !type || !panchayat_id || !district_id) {
    return res.status(400).json({ error: 'id, type, panchayat_id, district_id required' });
  }
  if (latitude == null || longitude == null || latitude === '' || longitude === '') {
    return res.status(400).json({ error: 'latitude and longitude are required' });
  }
  if (req.user.location_id !== parseInt(panchayat_id)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    await db.query(
      `INSERT INTO sensors (id, name, type, status, location_description, location, panchayat_id, villager_id, district_id)
       VALUES (?, ?, ?, ?, ?, ST_GeomFromText(CONCAT('POINT(', ?, ' ', ?, ')'), 4326), ?, ?, ?)`,
      [
        id,
        name || null,
        type,
        status || 'active',
        location_description || null,
        latitude,
        longitude,
        panchayat_id,
        villager_id || null,
        district_id,
      ]
    );

    const [newSensor] = await db.query(
      `SELECT s.id, s.name, s.type, s.status, s.location_description,
        ST_X(s.location) as latitude,
        ST_Y(s.location) as longitude,
        s.panchayat_id, s.villager_id, s.district_id,
        s.installed_at, s.updated_at
       FROM sensors s WHERE s.id = ?`,
      [id]
    );
    res.status(201).json(newSensor[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Sensor ID already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/sensors/:id
router.put('/:id', authenticate, requirePanchayatRole, async (req, res) => {
  const { name, type, status, location_description, latitude, longitude, villager_id } = req.body;

  try {
    const [existing] = await db.query(
      `SELECT s.*, ST_X(s.location) as latitude, ST_Y(s.location) as longitude
       FROM sensors s WHERE s.id = ?`,
      [req.params.id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Sensor not found' });

    if (req.user.location_id !== existing[0].panchayat_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const newLat = (latitude != null && latitude !== '') ? latitude : existing[0].latitude;
    const newLng = (longitude != null && longitude !== '') ? longitude : existing[0].longitude;

    await db.query(
      `UPDATE sensors SET
        name = ?,
        type = ?,
        status = ?,
        location_description = ?,
        location = ST_GeomFromText(CONCAT('POINT(', ?, ' ', ?, ')'), 4326),
        villager_id = ?
       WHERE id = ?`,
      [
        name ?? existing[0].name,
        type ?? existing[0].type,
        status ?? existing[0].status,
        location_description ?? existing[0].location_description,
        newLat,
        newLng,
        villager_id !== undefined ? (villager_id || null) : existing[0].villager_id,
        req.params.id,
      ]
    );

    const [updated] = await db.query(
      `SELECT s.id, s.name, s.type, s.status, s.location_description,
        ST_X(s.location) as latitude,
        ST_Y(s.location) as longitude,
        s.panchayat_id, s.villager_id, s.district_id,
        s.installed_at, s.updated_at
       FROM sensors s WHERE s.id = ?`,
      [req.params.id]
    );
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sensors/:id
router.delete('/:id', authenticate, requirePanchayatRole, async (req, res) => {
  try {
    const [existing] = await db.query('SELECT * FROM sensors WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: 'Sensor not found' });

    if (req.user.location_id !== existing[0].panchayat_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await db.query('DELETE FROM sensors WHERE id = ?', [req.params.id]);
    res.json({ message: 'Sensor deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



module.exports = router;
