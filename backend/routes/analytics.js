const express = require('express');
const router = express.Router();

const db = require('../config/db');
const { queryApi } = require('../config/influx');
const { authenticate } = require('../middleware/auth');

const RANGE_PATTERN = /^\d+(m|h|d)$/;
const ALLOWED_GROUP_BY = new Set(['sensor', 'panchayat', 'block', 'district']);

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

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeThreshold(ruleType, safeMin, safeMax, unit = null) {
  return {
    ruleType: ruleType || 'safe_range',
    safeMin: toNumber(safeMin),
    safeMax: toNumber(safeMax),
    unit: unit || null,
  };
}

function parseCustomThreshold(query) {
  const ruleType = query.customRuleType || null;
  const safeMin = query.customSafeMin === undefined ? null : toNumber(query.customSafeMin);
  const safeMax = query.customSafeMax === undefined ? null : toNumber(query.customSafeMax);

  if (!ruleType) return null;
  if (!['safe_range', 'upper_only', 'lower_only'].includes(ruleType)) return null;

  if (query.customSafeMin !== undefined && safeMin == null) return null;
  if (query.customSafeMax !== undefined && safeMax == null) return null;

  if (ruleType === 'safe_range' && (safeMin == null || safeMax == null)) return null;
  if (ruleType === 'upper_only' && safeMax == null) return null;
  if (ruleType === 'lower_only' && safeMin == null) return null;
  if (ruleType === 'safe_range' && safeMin > safeMax) return null;

  return normalizeThreshold(ruleType, safeMin, safeMax);
}

function isUnsafe(value, threshold) {
  if (value == null || !threshold) return false;

  if (threshold.ruleType === 'upper_only') {
    return threshold.safeMax != null ? value > threshold.safeMax : false;
  }

  if (threshold.ruleType === 'lower_only') {
    return threshold.safeMin != null ? value < threshold.safeMin : false;
  }

  if (threshold.safeMin != null && value < threshold.safeMin) return true;
  if (threshold.safeMax != null && value > threshold.safeMax) return true;
  return false;
}

function computeBreachMetrics(readings, threshold) {
  let breachCount = 0;
  let totalUnsafeMs = 0;
  let longestUnsafeMs = 0;
  let breachStartTime = null;
  let lastBreachAt = null;
  let previousUnsafe = false;

  for (let i = 0; i < readings.length; i += 1) {
    const reading = readings[i];
    const currentTime = new Date(reading.time).getTime();
    const unsafe = isUnsafe(reading.value, threshold);

    if (unsafe && !previousUnsafe) {
      breachCount += 1;
      breachStartTime = currentTime;
      lastBreachAt = reading.time;
    }

    if (!unsafe && previousUnsafe && breachStartTime != null) {
      const duration = currentTime - breachStartTime;
      totalUnsafeMs += duration;
      if (duration > longestUnsafeMs) longestUnsafeMs = duration;
      breachStartTime = null;
    }

    previousUnsafe = unsafe;
  }

  if (previousUnsafe && breachStartTime != null && readings.length) {
    const endTime = new Date(readings[readings.length - 1].time).getTime();
    const duration = Math.max(0, endTime - breachStartTime);
    totalUnsafeMs += duration;
    if (duration > longestUnsafeMs) longestUnsafeMs = duration;
  }

  return {
    breachCount,
    totalUnsafeMs,
    longestUnsafeMs,
    lastBreachAt,
  };
}

function createGroupRecord(sensor, groupBy) {
  if (groupBy === 'district') {
    return { id: sensor.district_id, name: sensor.district_name, level: 'district' };
  }
  if (groupBy === 'block') {
    return { id: sensor.block_id, name: sensor.block_name, level: 'block' };
  }
  if (groupBy === 'panchayat') {
    return { id: sensor.panchayat_id, name: sensor.panchayat_name, level: 'panchayat' };
  }
  return { id: sensor.id, name: sensor.name || sensor.id, level: 'sensor' };
}

async function fetchSensorReadings(sensor, range) {
  const measurement = `${sensor.district_name}_${sensor.type}`;
  const fluxQuery = `
    from(bucket: "${process.env.INFLUX_BUCKET || 'sensor_data'}")
      |> range(start: -${range})
      |> filter(fn: (r) => r._measurement == "${measurement}")
      |> filter(fn: (r) => r.sensor_id == "${sensor.id}")
      |> sort(columns: ["_time"])
  `;

  const readings = [];

  await new Promise((resolve) => {
    queryApi.queryRows(fluxQuery, {
      next(row, tableMeta) {
        const obj = tableMeta.toObject(row);
        const value = toNumber(obj._value);
        if (value != null) {
          readings.push({
            time: obj._time,
            value,
          });
        }
      },
      error() {
        resolve();
      },
      complete() {
        resolve();
      },
    });
  });

  return readings;
}

router.get('/threshold-breaches', authenticate, async (req, res) => {
  const user = req.user;
  const range = RANGE_PATTERN.test(req.query.range || '') ? req.query.range : '24h';
  const groupBy = ALLOWED_GROUP_BY.has(req.query.groupBy) ? req.query.groupBy : 'panchayat';
  const typeFilter = req.query.type || null;
  const customThreshold = parseCustomThreshold(req.query);

  if ((req.query.customRuleType || req.query.customSafeMin || req.query.customSafeMax) && !customThreshold) {
    return res.status(400).json({ error: 'Invalid custom threshold configuration' });
  }

  try {
    const { clause, params } = buildScopeClause(user);
    let sensorQuery = `
      SELECT s.id, s.name, s.type, s.status,
        s.location_description,
        ST_X(s.location) as latitude,
        ST_Y(s.location) as longitude,
        s.panchayat_id, s.district_id,
        lp.name as panchayat_name,
        lb.id as block_id, lb.name as block_name,
        ld.id as district_id_from_hierarchy, ld.name as district_name,
        sd.unit,
        st.rule_type,
        st.safe_min,
        st.safe_max
      FROM sensors s
      LEFT JOIN locations lp ON lp.id = s.panchayat_id
      LEFT JOIN locations lb ON lb.id = lp.parent_id
      LEFT JOIN locations ld ON ld.id = lb.parent_id
      LEFT JOIN sensor_definitions sd ON sd.sensor_key = s.type
      LEFT JOIN sensor_thresholds st ON st.sensor_definition_id = sd.id
      WHERE s.status != 'faulty'
    `;
    const queryParams = [];

    if (typeFilter) {
      sensorQuery += ' AND s.type = ?';
      queryParams.push(typeFilter);
    }

    sensorQuery += clause;
    queryParams.push(...params);
    sensorQuery += ' ORDER BY s.id';

    const [sensors] = await db.query(sensorQuery, queryParams);
    const sensorMetrics = [];
    const grouped = new Map();

    for (const sensor of sensors) {
      const threshold = customThreshold && typeFilter
        ? { ...customThreshold, unit: sensor.unit || null }
        : normalizeThreshold(sensor.rule_type, sensor.safe_min, sensor.safe_max, sensor.unit);

      if (!threshold) continue;
      if (threshold.ruleType === 'safe_range' && threshold.safeMin == null && threshold.safeMax == null) continue;
      if (threshold.ruleType === 'upper_only' && threshold.safeMax == null) continue;
      if (threshold.ruleType === 'lower_only' && threshold.safeMin == null) continue;

      const readings = await fetchSensorReadings(sensor, range);
      const metrics = computeBreachMetrics(readings, threshold);
      const unsafeNow = readings.length
        ? isUnsafe(readings[readings.length - 1].value, threshold)
        : false;

      const summary = {
        sensorId: sensor.id,
        sensorName: sensor.name || sensor.id,
        type: sensor.type,
        threshold,
        readingCount: readings.length,
        breachCount: metrics.breachCount,
        totalUnsafeMs: metrics.totalUnsafeMs,
        totalUnsafeHours: Number((metrics.totalUnsafeMs / 3600000).toFixed(2)),
        longestUnsafeMs: metrics.longestUnsafeMs,
        longestUnsafeHours: Number((metrics.longestUnsafeMs / 3600000).toFixed(2)),
        lastBreachAt: metrics.lastBreachAt,
        unsafeNow,
        locationDescription: sensor.location_description,
        latitude: sensor.latitude,
        longitude: sensor.longitude,
        panchayat: { id: sensor.panchayat_id, name: sensor.panchayat_name },
        block: { id: sensor.block_id, name: sensor.block_name },
        district: { id: sensor.district_id, name: sensor.district_name },
      };

      sensorMetrics.push(summary);

      const group = createGroupRecord(sensor, groupBy);
      if (!group.id) continue;

      if (!grouped.has(group.id)) {
        grouped.set(group.id, {
          id: group.id,
          name: group.name,
          level: group.level,
          breachCount: 0,
          totalUnsafeMs: 0,
          affectedSensors: 0,
          sensorsWithBreaches: [],
        });
      }

      const target = grouped.get(group.id);
      target.breachCount += metrics.breachCount;
      target.totalUnsafeMs += metrics.totalUnsafeMs;
      if (metrics.breachCount > 0) {
        target.affectedSensors += 1;
        target.sensorsWithBreaches.push({
          sensorId: sensor.id,
          type: sensor.type,
          breachCount: metrics.breachCount,
          totalUnsafeHours: Number((metrics.totalUnsafeMs / 3600000).toFixed(2)),
        });
      }
    }

    const groups = [...grouped.values()]
      .map((group) => ({
        ...group,
        totalUnsafeHours: Number((group.totalUnsafeMs / 3600000).toFixed(2)),
      }))
      .sort((a, b) => {
        if (b.breachCount !== a.breachCount) return b.breachCount - a.breachCount;
        return b.totalUnsafeMs - a.totalUnsafeMs;
      });

    const topSensors = [...sensorMetrics]
      .sort((a, b) => {
        if (b.breachCount !== a.breachCount) return b.breachCount - a.breachCount;
        return b.totalUnsafeMs - a.totalUnsafeMs;
      })
      .slice(0, 10);

    res.json({
      range,
      groupBy,
      filters: {
        type: typeFilter,
        threshold: customThreshold && typeFilter ? { ...customThreshold } : null,
      },
      summary: {
        totalSensorsAnalyzed: sensorMetrics.length,
        sensorsWithBreaches: sensorMetrics.filter((sensor) => sensor.breachCount > 0).length,
        currentlyUnsafeSensors: sensorMetrics.filter((sensor) => sensor.unsafeNow).length,
        totalBreaches: sensorMetrics.reduce((sum, sensor) => sum + sensor.breachCount, 0),
        totalUnsafeHours: Number(
          (sensorMetrics.reduce((sum, sensor) => sum + sensor.totalUnsafeMs, 0) / 3600000).toFixed(2)
        ),
      },
      topSensors,
      groups,
      sensors: sensorMetrics,
    });
  } catch (err) {
    console.error('Threshold breach analytics failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
