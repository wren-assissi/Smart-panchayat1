const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { queryApi } = require('../config/influx');
const { authenticate, requirePanchayatRole } = require('../middleware/auth');
const TREND_RANGE = '24h';
const ALLOWED_TREND_RANGES = new Set(['24h', '7d', '30d']);
const ANALYSIS_MODES = new Set(['monitor', 'compare', 'units']);
const DURATION_UNITS = new Set(['day', 'week', 'month', 'year']);
const BUCKET_UNITS = new Set(['hour', 'day', 'week', 'month', 'year']);

function parsePositiveInteger(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseCsvList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseDateInput(value) {
  if (!value) return null;
  const parsed = new Date(`${String(value).trim()}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addDays(date, value) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + value);
  return nextDate;
}

function escapeFluxString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function subtractDuration(date, value, unit) {
  const nextDate = new Date(date);

  if (unit === 'day') {
    nextDate.setUTCDate(nextDate.getUTCDate() - value);
    return nextDate;
  }

  if (unit === 'week') {
    nextDate.setUTCDate(nextDate.getUTCDate() - (value * 7));
    return nextDate;
  }

  if (unit === 'month') {
    nextDate.setUTCMonth(nextDate.getUTCMonth() - value);
    return nextDate;
  }

  nextDate.setUTCFullYear(nextDate.getUTCFullYear() - value);
  return nextDate;
}

function getAvailableMonitoringBucketUnits(durationValue, durationUnit) {
  if (durationUnit === 'day') {
    if (durationValue <= 7) return ['hour', 'day'];
    if (durationValue <= 90) return ['day', 'week'];
    return ['week', 'month'];
  }

  if (durationUnit === 'week') {
    if (durationValue <= 1) return ['hour', 'day'];
    if (durationValue <= 8) return ['day', 'week'];
    if (durationValue >= 52) return ['month', 'year'];
    return ['week', 'month'];
  }

  if (durationUnit === 'month') {
    if (durationValue <= 1) return ['day', 'week'];
    if (durationValue < 24) return ['week', 'month'];
    return ['month', 'year'];
  }

  if (durationValue === 1) return ['week', 'month'];
  if (durationValue <= 3) return ['month', 'year'];
  return ['year'];
}

function getMonitoringBucketUnit(durationValue, durationUnit, requestedBucketUnit) {
  const allowedBucketUnits = getAvailableMonitoringBucketUnits(durationValue, durationUnit);
  if (requestedBucketUnit && allowedBucketUnits.includes(requestedBucketUnit)) {
    return requestedBucketUnit;
  }

  return allowedBucketUnits[0];
}

function formatBucketLabel(bucketStart, bucketUnit) {
  const date = new Date(bucketStart);

  if (bucketUnit === 'month') {
    return date.toLocaleDateString([], { month: 'short', year: 'numeric' });
  }

  if (bucketUnit === 'year') {
    return date.toLocaleDateString([], { year: 'numeric' });
  }

  if (bucketUnit === 'hour') {
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
    });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function getBucketStart(dateInput, bucketUnit) {
  const date = new Date(dateInput);

  if (bucketUnit === 'month') {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
  }

  if (bucketUnit === 'year') {
    return new Date(Date.UTC(date.getUTCFullYear(), 0, 1)).toISOString();
  }

  if (bucketUnit === 'week') {
    const currentDay = date.getUTCDay();
    const diffToMonday = currentDay === 0 ? 6 : currentDay - 1;
    return new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - diffToMonday
    )).toISOString();
  }

  if (bucketUnit === 'hour') {
    return new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
    )).toISOString();
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

function buildBucketTimeline(start, end, bucketUnit) {
  const buckets = [];
  let cursor = new Date(getBucketStart(start, bucketUnit));
  const limit = end.getTime();

  while (cursor.getTime() < limit) {
    buckets.push({
      bucketStart: cursor.toISOString(),
      label: formatBucketLabel(cursor, bucketUnit),
    });

    if (bucketUnit === 'month') {
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    } else if (bucketUnit === 'year') {
      cursor = new Date(Date.UTC(cursor.getUTCFullYear() + 1, 0, 1));
    } else if (bucketUnit === 'week') {
      cursor = new Date(cursor.getTime() + (7 * 24 * 60 * 60 * 1000));
    } else if (bucketUnit === 'hour') {
      cursor = new Date(cursor.getTime() + (60 * 60 * 1000));
    } else {
      cursor = new Date(cursor.getTime() + (24 * 60 * 60 * 1000));
    }
  }

  return buckets;
}

function buildFluxSensorFilter(sensorIds) {
  if (!sensorIds.length) return '';
  const clauses = sensorIds.map((sensorId) => `r.sensor_id == "${escapeFluxString(sensorId)}"`);
  return `\n        |> filter(fn: (r) => ${clauses.join(' or ')})`;
}

async function getTrendRowsForSensors(sensors, start, stop) {
  if (!sensors.length) return [];

  const sensorsById = new Map(sensors.map((sensor) => [String(sensor.id), sensor]));
  const sensorsByMeasurement = new Map();

  sensors.forEach((sensor) => {
    const measurement = `${sensor.district_name}_${sensor.type}`;
    const existing = sensorsByMeasurement.get(measurement) || [];
    existing.push(String(sensor.id));
    sensorsByMeasurement.set(measurement, existing);
  });

  const rows = [];

  await Promise.all([...sensorsByMeasurement.entries()].map(async ([measurement, sensorIds]) => {
    const fluxQuery = `
      from(bucket: "${process.env.INFLUX_BUCKET || 'sensor_data'}")
        |> range(start: time(v: "${start.toISOString()}"), stop: time(v: "${stop.toISOString()}"))
        |> filter(fn: (r) => r._measurement == "${escapeFluxString(measurement)}")${buildFluxSensorFilter(sensorIds)}
        |> keep(columns: ["_time", "_value", "sensor_id"])
        |> sort(columns: ["_time"])
    `;

    await new Promise((resolve) => {
      queryApi.queryRows(fluxQuery, {
        next(row, tableMeta) {
          const obj = tableMeta.toObject(row);
          const sensor = sensorsById.get(String(obj.sensor_id));
          const value = Number(obj._value);
          if (!sensor || Number.isNaN(value) || !obj._time) return;

          rows.push({
            time: obj._time,
            value,
            sensorId: String(sensor.id),
            sensorName: sensor.name || String(sensor.id),
            sensorType: sensor.type,
            districtId: sensor.district_id,
            districtName: sensor.district_name,
            blockId: sensor.block_id,
            blockName: sensor.block_name,
            panchayatId: sensor.panchayat_id,
            panchayatName: sensor.panchayat_name,
          });
        },
        error() {
          resolve();
        },
        complete() {
          resolve();
        },
      });
    });
  }));

  return rows.sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime());
}

function resolveSeriesConfig(sensors, selectedSensorTypes) {
  const allowedTypes = selectedSensorTypes.length
    ? new Set(selectedSensorTypes)
    : new Set(sensors.map((sensor) => sensor.type));

  return {
    items: [...allowedTypes]
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right))
      .map((sensorType) => ({
        key: `type:${sensorType}`,
        label: sensorType,
        sensorType,
      })),
  };
}

function getSeriesKeyForRow(row) {
  return `type:${row.sensorType}`;
}

function buildMonitoringAnalysis(rows, seriesConfig, durationValue, durationUnit, requestedBucketUnit) {
  const end = new Date();
  const start = subtractDuration(end, durationValue, durationUnit);
  const bucketUnit = getMonitoringBucketUnit(durationValue, durationUnit, requestedBucketUnit);
  const timeline = buildBucketTimeline(start, end, bucketUnit);
  const seriesStats = new Map();

  seriesConfig.items.forEach((series) => {
    seriesStats.set(series.key, new Map());
  });

  rows.forEach((row) => {
    const rowTime = new Date(row.time);
    if (rowTime < start || rowTime > end) return;
    const seriesKey = getSeriesKeyForRow(row);
    if (!seriesStats.has(seriesKey)) return;

    const bucketStart = getBucketStart(rowTime, bucketUnit);
    const bucketMap = seriesStats.get(seriesKey);
    const stats = bucketMap.get(bucketStart) || { sum: 0, count: 0 };
    stats.sum += row.value;
    stats.count += 1;
    bucketMap.set(bucketStart, stats);
  });

  const chart = timeline.map((bucket) => {
    const entry = {
      bucketStart: bucket.bucketStart,
      label: bucket.label,
    };

    seriesConfig.items.forEach((series) => {
      const stats = seriesStats.get(series.key)?.get(bucket.bucketStart);
      entry[series.key] = stats ? Number((stats.sum / stats.count).toFixed(2)) : null;
    });

    return entry;
  });

  const series = seriesConfig.items.map((item) => ({
    ...item,
    values: timeline.map((bucket) => {
      const stats = seriesStats.get(item.key)?.get(bucket.bucketStart);
      return {
        bucketStart: bucket.bucketStart,
        label: bucket.label,
        value: stats ? Number((stats.sum / stats.count).toFixed(2)) : null,
        count: stats?.count || 0,
      };
    }),
  }));

  return {
    duration: {
      value: durationValue,
      unit: durationUnit,
      label: `Past ${durationValue} ${durationUnit}${durationValue === 1 ? '' : 's'}`,
    },
    availableBucketUnits: getAvailableMonitoringBucketUnits(durationValue, durationUnit),
    bucketUnit,
    chart,
    series,
  };
}

function getAverageForWindow(rows, seriesConfig, start, end) {
  const statsBySeries = new Map(seriesConfig.items.map((item) => [item.key, { sum: 0, count: 0 }]));

  rows.forEach((row) => {
    const rowTime = new Date(row.time);
    if (rowTime < start || rowTime >= end) return;

    const seriesKey = getSeriesKeyForRow(row);
    const stats = statsBySeries.get(seriesKey);
    if (!stats) return;
    stats.sum += row.value;
    stats.count += 1;
  });

  return statsBySeries;
}

function buildComparisonAnalysis(rows, seriesConfig, previousStart, previousEnd, currentStart, currentEnd) {
  const intervalDays = Math.max(
    1,
    Math.round((currentEnd.getTime() - currentStart.getTime()) / (24 * 60 * 60 * 1000)),
  );

  const previousStats = getAverageForWindow(rows, seriesConfig, previousStart, previousEnd);
  const currentStats = getAverageForWindow(rows, seriesConfig, currentStart, currentEnd);

  const series = seriesConfig.items.map((item) => {
    const previous = previousStats.get(item.key) || { sum: 0, count: 0 };
    const current = currentStats.get(item.key) || { sum: 0, count: 0 };
    const previousValue = previous.count ? Number((previous.sum / previous.count).toFixed(2)) : null;
    const currentValue = current.count ? Number((current.sum / current.count).toFixed(2)) : null;
    const delta = previousValue == null || currentValue == null
      ? null
      : Number((currentValue - previousValue).toFixed(2));
    const percentChange = previousValue == null || currentValue == null || previousValue === 0
      ? null
      : Number((((currentValue - previousValue) / previousValue) * 100).toFixed(2));

    return {
      ...item,
      previousValue,
      currentValue,
      delta,
      percentChange,
    };
  });

  return {
    intervalDays,
    previous: {
      start: previousStart.toISOString(),
      end: previousEnd.toISOString(),
      label: 'Interval A',
    },
    current: {
      start: currentStart.toISOString(),
      end: currentEnd.toISOString(),
      label: 'Interval B',
    },
    chart: [
      Object.assign({ label: 'Interval A' }, ...series.map((item) => ({ [item.key]: item.previousValue }))),
      Object.assign({ label: 'Interval B' }, ...series.map((item) => ({ [item.key]: item.currentValue }))),
    ],
    series,
  };
}

function getAvailableComparisonLevels(userRole) {
  if (userRole === 'state') return ['district', 'block', 'panchayat'];
  if (userRole === 'district') return ['block', 'panchayat'];
  if (userRole === 'block') return ['panchayat'];
  return [];
}

function getUnitFields(level) {
  if (level === 'district') {
    return { id: 'districtId', name: 'districtName' };
  }
  if (level === 'block') {
    return { id: 'blockId', name: 'blockName' };
  }
  return { id: 'panchayatId', name: 'panchayatName' };
}

function getUnitOptionsForLevel(sensors, comparisonLevel) {
  const { id: unitIdField, name: unitNameField } = getUnitFields(comparisonLevel);
  const units = new Map();

  sensors.forEach((sensor) => {
    const unitId = sensor[unitIdField];
    const unitName = sensor[unitNameField];
    if (!unitId || !unitName) return;
    units.set(String(unitId), { id: String(unitId), name: unitName });
  });

  return [...units.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function getUnitsComparisonBucketUnit(periodStart, periodEnd) {
  const durationDays = Math.max(
    1,
    Math.round((periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000)),
  );

  if (durationDays <= 7) return 'hour';
  if (durationDays <= 90) return 'day';
  if (durationDays <= 365) return 'week';
  return 'month';
}

function buildUnitComparisonAnalysis(rows, sensors, seriesConfig, comparisonLevel, periodStart, periodEnd, selectedUnitIds) {
  const { id: unitIdField, name: unitNameField } = getUnitFields(comparisonLevel);
  const allUnitOptions = getUnitOptionsForLevel(sensors, comparisonLevel);
  const allowedUnitIds = selectedUnitIds.length
    ? new Set(selectedUnitIds.map(String))
    : new Set(allUnitOptions.map((unit) => unit.id));
  const statsBySeries = new Map(seriesConfig.items.map((item) => [item.key, new Map()]));

  rows.forEach((row) => {
    const rowTime = new Date(row.time);
    if (rowTime < periodStart || rowTime >= periodEnd) return;

    const seriesKey = getSeriesKeyForRow(row);
    const seriesUnits = statsBySeries.get(seriesKey);
    if (!seriesUnits) return;

    const unitId = row[unitIdField] == null ? null : String(row[unitIdField]);
    const unitName = row[unitNameField];
    if (!unitId || !unitName) return;
    if (!allowedUnitIds.has(unitId)) return;

    const stats = seriesUnits.get(unitId) || { unitId, unitName, sum: 0, count: 0 };
    stats.sum += row.value;
    stats.count += 1;
    seriesUnits.set(unitId, stats);
  });

  const rankings = seriesConfig.items.map((item) => {
    const rankedUnits = [...(statsBySeries.get(item.key)?.values() || [])]
      .map((stats) => ({
        unitId: stats.unitId,
        unitName: stats.unitName,
        value: Number((stats.sum / stats.count).toFixed(2)),
        count: stats.count,
      }))
      .sort((left, right) => right.value - left.value || left.unitName.localeCompare(right.unitName))
      .map((stats, index) => ({
        ...stats,
        rank: index + 1,
      }));

    return {
      ...item,
      units: rankedUnits,
    };
  });

  const bucketUnit = getUnitsComparisonBucketUnit(periodStart, periodEnd);
  const timeline = buildBucketTimeline(periodStart, periodEnd, bucketUnit);

  const chartSeries = rankings.map((ranking) => {
    const visibleUnits = selectedUnitIds.length
      ? ranking.units.slice(0, 10)
      : ranking.units.slice(0, 10);
    const visibleUnitIds = new Set(visibleUnits.map((unit) => unit.unitId));
    const bucketStats = new Map();

    rows.forEach((row) => {
      const rowTime = new Date(row.time);
      if (rowTime < periodStart || rowTime >= periodEnd) return;
      if (`type:${row.sensorType}` !== ranking.key) return;

      const unitId = row[unitIdField] == null ? null : String(row[unitIdField]);
      if (!unitId || !visibleUnitIds.has(unitId)) return;

      const bucketStart = getBucketStart(rowTime, bucketUnit);
      const unitBuckets = bucketStats.get(unitId) || new Map();
      const stats = unitBuckets.get(bucketStart) || { sum: 0, count: 0 };
      stats.sum += row.value;
      stats.count += 1;
      unitBuckets.set(bucketStart, stats);
      bucketStats.set(unitId, unitBuckets);
    });

    const chart = timeline.map((bucket) => {
      const entry = {
        bucketStart: bucket.bucketStart,
        label: bucket.label,
      };

      visibleUnits.forEach((unit) => {
        const stats = bucketStats.get(unit.unitId)?.get(bucket.bucketStart);
        entry[`unit:${unit.unitId}`] = stats ? Number((stats.sum / stats.count).toFixed(2)) : null;
      });

      return entry;
    });

    return {
      key: ranking.key,
      sensorType: ranking.sensorType,
      label: ranking.label,
      bucketUnit,
      chart,
      visibleUnits,
      chartTruncated: ranking.units.length > visibleUnits.length,
    };
  });

  return {
    period: {
      start: periodStart.toISOString(),
      end: periodEnd.toISOString(),
      label: 'Selected period',
    },
    comparisonLevel,
    units: allUnitOptions.filter((unit) => allowedUnitIds.has(unit.id)),
    rankings,
    charts: chartSeries,
  };
}

function normalizeSensorType(value) {
  return String(value || '').trim();
}

function parseThresholdValue(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

async function getSensorDefinitionByKey(sensorKey) {
  const [rows] = await db.query(
    `SELECT sd.id, sd.sensor_key, sd.unit, sd.value_kind,
            st.rule_type, st.safe_min, st.safe_max
     FROM sensor_definitions sd
     LEFT JOIN sensor_thresholds st ON st.sensor_definition_id = sd.id
     WHERE sd.sensor_key = ?`,
    [sensorKey]
  );

  return rows[0] || null;
}

async function ensureSensorTypeExists(sensorType) {
  const normalizedType = normalizeSensorType(sensorType);
  if (!normalizedType) return false;

  const [rows] = await db.query(
    'SELECT id FROM sensor_definitions WHERE sensor_key = ? LIMIT 1',
    [normalizedType]
  );

  return rows.length > 0;
}

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

function parseLocationId(value) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
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

function formatTrendSeries(typeTrendMap, sensorType) {
  const trendBuckets = typeTrendMap?.get(sensorType);
  if (!trendBuckets) return [];

  return [...trendBuckets.entries()]
    .sort((left, right) => new Date(left[0]).getTime() - new Date(right[0]).getTime())
    .map(([time, stats]) => ({
      time,
      average: Number((stats.sum / stats.count).toFixed(2)),
      count: stats.count,
    }));
}

function appendTrendPoint(container, sensorType, time, value) {
  const typeBuckets = container.get(sensorType) || new Map();
  const stats = typeBuckets.get(time) || { sum: 0, count: 0 };
  stats.sum += value;
  stats.count += 1;
  typeBuckets.set(time, stats);
  container.set(sensorType, typeBuckets);
}

function buildAverageTypeMap(sensors, readings) {
  const typeMap = new Map();

  for (const sensor of sensors) {
    const reading = readings[sensor.id];
    if (reading == null || Number.isNaN(reading)) continue;

    const stats = typeMap.get(sensor.type) || { sum: 0, count: 0 };
    stats.sum += reading;
    stats.count += 1;
    typeMap.set(sensor.type, stats);
  }

  return typeMap;
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

async function getTrendDataForSensors(sensors, childLevel, trendRange) {
  if (!sensors.length) {
    return { overall: new Map(), children: new Map() };
  }

  const sensorsById = new Map(sensors.map((sensor) => [String(sensor.id), sensor]));
  const measurementNames = [...new Set(
    sensors.map((sensor) => `${sensor.district_name}_${sensor.type}`)
  )];

  const overall = new Map();
  const children = new Map();

  await Promise.all(measurementNames.map(async (measurement) => {
    const fluxQuery = `
      from(bucket: "${process.env.INFLUX_BUCKET || 'sensor_data'}")
        |> range(start: -${trendRange})
        |> filter(fn: (r) => r._measurement == "${measurement}")
        |> keep(columns: ["_time", "_value", "sensor_id"])
        |> sort(columns: ["_time"])
    `;

    await new Promise((resolve) => {
      queryApi.queryRows(fluxQuery, {
        next(row, tableMeta) {
          const obj = tableMeta.toObject(row);
          const sensor = sensorsById.get(String(obj.sensor_id));
          const value = Number(obj._value);
          if (!sensor || Number.isNaN(value) || !obj._time) return;

          appendTrendPoint(overall, sensor.type, obj._time, value);

          if (!childLevel) return;
          const childId = sensor[`${childLevel}_id`];
          if (!childId) return;

          const childTrendMap = children.get(childId) || new Map();
          appendTrendPoint(childTrendMap, sensor.type, obj._time, value);
          children.set(childId, childTrendMap);
        },
        error() {
          resolve();
        },
        complete() {
          resolve();
        },
      });
    });
  }));

  return { overall, children };
}

async function resolveAggregateScope(user, query) {
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
      `SELECT p.id as panchayat_id, p.name as panchayat_name,
              b.id as block_id, b.name as block_name,
              d.id as district_id, d.name as district_name
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

    return {
      clause: ' AND s.panchayat_id = ?',
      params: [location.panchayat_id],
      scopeId: location.panchayat_id,
      scopeType: 'panchayat',
      scopeName: location.panchayat_name,
    };
  }

  if (blockId) {
    const [rows] = await db.query(
      `SELECT b.id as block_id, b.name as block_name,
              d.id as district_id, d.name as district_name
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

    return {
      clause: ' AND lb.id = ?',
      params: [location.block_id],
      scopeId: location.block_id,
      scopeType: 'block',
      scopeName: location.block_name,
    };
  }

  if (districtId) {
    const [rows] = await db.query(
      "SELECT id, name FROM locations WHERE id = ? AND type = 'district'",
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

    return {
      clause: ' AND ld.id = ?',
      params: [districtId],
      scopeId: districtId,
      scopeType: 'district',
      scopeName: rows[0].name,
    };
  }

  const { clause, params } = buildScopeClause(user);
  return {
    clause,
    params,
    scopeId: user.role === 'state' ? null : user.location_id,
    scopeType: user.role === 'state' ? 'state' : user.role,
    scopeName: user.role === 'state' ? 'Kerala' : user.location_name,
  };
}

router.get('/types', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT sd.id, sd.sensor_key, sd.unit, sd.value_kind,
              st.rule_type, st.safe_min, st.safe_max
       FROM sensor_definitions sd
       LEFT JOIN sensor_thresholds st ON st.sensor_definition_id = sd.id
       ORDER BY sd.sensor_key`
    );

    res.json(rows);
  } catch (err) {
    console.error('Sensor type query failed:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/types', authenticate, requirePanchayatRole, async (req, res) => {
  const sensorKey = normalizeSensorType(req.body.sensor_key);
  const unit = String(req.body.unit || '').trim() || null;
  const valueKind = String(req.body.value_kind || 'number').trim();
  const ruleType = String(req.body.rule_type || '').trim();
  const safeMin = parseThresholdValue(req.body.safe_min);
  const safeMax = parseThresholdValue(req.body.safe_max);

  if (!sensorKey) {
    return res.status(400).json({ error: 'sensor_key is required' });
  }

  if (!['number', 'boolean', 'enum'].includes(valueKind)) {
    return res.status(400).json({ error: 'value_kind must be number, boolean, or enum' });
  }

  if (!['upper_only', 'lower_only', 'safe_range'].includes(ruleType)) {
    return res.status(400).json({ error: 'rule_type must be upper_only, lower_only, or safe_range' });
  }

  if (Number.isNaN(safeMin) || Number.isNaN(safeMax)) {
    return res.status(400).json({ error: 'safe_min and safe_max must be valid numbers when provided' });
  }

  if (ruleType === 'safe_range' && (safeMin == null || safeMax == null)) {
    return res.status(400).json({ error: 'safe_range requires both safe_min and safe_max' });
  }

  if (ruleType === 'upper_only' && safeMax == null) {
    return res.status(400).json({ error: 'upper_only requires safe_max' });
  }

  if (ruleType === 'lower_only' && safeMin == null) {
    return res.status(400).json({ error: 'lower_only requires safe_min' });
  }

  if (ruleType === 'safe_range' && safeMin > safeMax) {
    return res.status(400).json({ error: 'safe_min cannot be greater than safe_max' });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [definitionResult] = await connection.query(
      `INSERT INTO sensor_definitions (sensor_key, unit, value_kind)
       VALUES (?, ?, ?)`,
      [sensorKey, unit, valueKind]
    );

    await connection.query(
      `INSERT INTO sensor_thresholds (sensor_definition_id, rule_type, safe_min, safe_max)
       VALUES (?, ?, ?, ?)`,
      [
        definitionResult.insertId,
        ruleType,
        safeMin,
        safeMax,
      ]
    );

    await connection.commit();

    const createdDefinition = await getSensorDefinitionByKey(sensorKey);
    res.status(201).json(createdDefinition);
  } catch (err) {
    await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Sensor type already exists' });
    }
    console.error('Sensor type creation failed:', err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// GET /api/sensors?districtId=X&blockId=Y&panchayatId=Z&search=id&type=Temp
router.get('/', authenticate, async (req, res) => {
  const { search, type } = req.query;

  try {
    const { clause, params: scopeParams } = await resolveAggregateScope(req.user, req.query);
    let query = `
      SELECT s.id, s.name, s.type, s.status, s.location_description,
        ST_X(s.location) as latitude,
        ST_Y(s.location) as longitude,
        s.panchayat_id, s.villager_id, s.district_id,
        s.installed_at, s.updated_at,
        v.name as villager_name,
        lp.name as panchayat_name,
        lb.name as block_name,
        ld.name as district_name
      FROM sensors s
      LEFT JOIN villagers v ON v.id = s.villager_id
      LEFT JOIN locations lp ON lp.id = s.panchayat_id
      LEFT JOIN locations lb ON lb.id = lp.parent_id
      LEFT JOIN locations ld ON ld.id = lb.parent_id
      WHERE 1=1 ${clause}
    `;
    const params = [...scopeParams];

    if (search) {
      query += ' AND (s.id LIKE ? OR s.name LIKE ? OR s.type LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (type) {
      query += ' AND s.type = ?';
      params.push(type);
    }

    query += ' ORDER BY s.id';

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
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
    const trendRange = ALLOWED_TREND_RANGES.has(req.query.trendRange) ? req.query.trendRange : TREND_RANGE;
    const includeChildren = req.query.includeChildren !== 'false';
    const {
      clause,
      params,
      scopeId,
      scopeType,
      scopeName,
    } = await resolveAggregateScope(user, req.query);

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
    const overallTypeMap = buildAverageTypeMap(sensors, readings);

    let childLevel = null;
    let childGroups = [];
    let childLocations = [];

    if (includeChildren && scopeType === 'state') {
      childLevel = 'district';
      const [rows] = await db.query(
        "SELECT id, name FROM locations WHERE type='district' ORDER BY name"
      );
      childLocations = rows;
    } else if (includeChildren && scopeType === 'district') {
      childLevel = 'block';
      const [rows] = await db.query(
        "SELECT id, name FROM locations WHERE type='block' AND parent_id=? ORDER BY name",
        [scopeId]
      );
      childLocations = rows;
    } else if (includeChildren && scopeType === 'block') {
      childLevel = 'panchayat';
      const [rows] = await db.query(
        "SELECT id, name FROM locations WHERE type='panchayat' AND parent_id=? ORDER BY name",
        [scopeId]
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

    const trendData = await getTrendDataForSensors(sensors, childLevel, trendRange);

    res.json({
      generatedAt: new Date().toISOString(),
      trend: {
        range: trendRange,
        interval: 'raw',
      },
      scope: {
        level: scopeType,
        name: scopeName,
        averages: formatAverages(overallTypeMap).map((item) => ({
          ...item,
          trend: formatTrendSeries(trendData.overall, item.sensorType),
        })),
      },
      childLevel,
      children: childGroups.map((child) => ({
        ...child,
        averages: child.averages.map((item) => ({
          ...item,
          trend: formatTrendSeries(trendData.children.get(child.id), item.sensorType),
        })),
      })),
    });
  } catch (err) {
    console.error('Aggregate report query failed:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// GET /api/sensors/trend-analysis
router.get('/trend-analysis', authenticate, async (req, res) => {
  try {
    const mode = ANALYSIS_MODES.has(req.query.mode) ? req.query.mode : 'monitor';
    const durationValue = parsePositiveInteger(req.query.durationValue, 6);
    const durationUnit = DURATION_UNITS.has(req.query.durationUnit) ? req.query.durationUnit : 'month';
    const requestedBucketUnit = BUCKET_UNITS.has(req.query.bucketUnit) ? req.query.bucketUnit : null;
    const intervalDays = parsePositiveInteger(req.query.intervalDays, 30);
    const comparePreviousStart = parseDateInput(req.query.comparePreviousStart);
    const comparePreviousEnd = parseDateInput(req.query.comparePreviousEnd);
    const compareCurrentStart = parseDateInput(req.query.compareCurrentStart);
    const compareCurrentEnd = parseDateInput(req.query.compareCurrentEnd);
    const requestedComparisonLevel = String(req.query.comparisonLevel || '').trim();
    const selectedComparisonUnitIds = parseCsvList(req.query.comparisonUnitIds);
    const unitsPeriodStart = parseDateInput(req.query.unitsPeriodStart);
    const unitsPeriodEnd = parseDateInput(req.query.unitsPeriodEnd);
    const selectedSensorTypes = parseCsvList(req.query.sensorTypes);
    const {
      clause,
      params,
      scopeType,
      scopeName,
    } = await resolveAggregateScope(req.user, req.query);

    const [sensors] = await db.query(
      `SELECT s.id, s.name, s.type,
        lp.id as panchayat_id, lp.name as panchayat_name,
        lb.id as block_id, lb.name as block_name,
        ld.id as district_id, ld.name as district_name
       FROM sensors s
       LEFT JOIN locations lp ON lp.id = s.panchayat_id
       LEFT JOIN locations lb ON lb.id = lp.parent_id
       LEFT JOIN locations ld ON ld.id = lb.parent_id
       WHERE 1=1 ${clause} AND s.status != 'faulty'
       ORDER BY s.type, s.id`,
      params
    );

    const availableSensorTypes = [...new Set(sensors.map((sensor) => sensor.type))].sort((left, right) => (
      left.localeCompare(right)
    ));
    const filteredSensors = sensors.filter((sensor) => (
      !selectedSensorTypes.length || selectedSensorTypes.includes(sensor.type)
    ));
    const seriesConfig = resolveSeriesConfig(sensors, selectedSensorTypes);

    let analysisStart = new Date();
    let analysisEnd = new Date();
    let comparisonRanges = null;
    let unitsRange = null;
    let comparisonLevel = null;
    if (mode === 'compare') {
      const currentEndBase = compareCurrentEnd || new Date();
      const currentEndExclusive = addDays(currentEndBase, 1);
      const currentStart = compareCurrentStart || subtractDuration(currentEndExclusive, intervalDays, 'day');
      const previousEndBase = comparePreviousEnd || subtractDuration(currentStart, 1, 'day');
      const previousEndExclusive = addDays(previousEndBase, 1);
      const previousStart = comparePreviousStart || subtractDuration(previousEndExclusive, intervalDays, 'day');

      if (previousStart >= previousEndExclusive || currentStart >= currentEndExclusive) {
        return res.status(400).json({ error: 'Comparison interval start date must be before end date' });
      }

      comparisonRanges = {
        previousStart,
        previousEnd: previousEndExclusive,
        currentStart,
        currentEnd: currentEndExclusive,
      };
      analysisStart = previousStart < currentStart ? previousStart : currentStart;
      analysisEnd = previousEndExclusive > currentEndExclusive ? previousEndExclusive : currentEndExclusive;
    } else if (mode === 'units') {
      const allowedComparisonLevels = getAvailableComparisonLevels(req.user.role);
      comparisonLevel = allowedComparisonLevels.includes(requestedComparisonLevel)
        ? requestedComparisonLevel
        : allowedComparisonLevels[0];

      if (!comparisonLevel) {
        return res.status(400).json({ error: 'Administrative unit comparison is not available for this role' });
      }

      const periodEndBase = unitsPeriodEnd || new Date();
      const periodEndExclusive = addDays(periodEndBase, 1);
      const periodStart = unitsPeriodStart || subtractDuration(periodEndExclusive, 30, 'day');
      if (periodStart >= periodEndExclusive) {
        return res.status(400).json({ error: 'Selected period start date must be before end date' });
      }

      unitsRange = {
        start: periodStart,
        end: periodEndExclusive,
      };
      analysisStart = periodStart;
      analysisEnd = periodEndExclusive;
    } else {
      analysisStart = subtractDuration(new Date(), durationValue, durationUnit);
    }

    const trendRows = await getTrendRowsForSensors(filteredSensors, analysisStart, analysisEnd);
    const payload = mode === 'compare'
      ? {
          compare: buildComparisonAnalysis(
            trendRows,
            seriesConfig,
            comparisonRanges.previousStart,
            comparisonRanges.previousEnd,
            comparisonRanges.currentStart,
            comparisonRanges.currentEnd,
          ),
        }
      : mode === 'units'
        ? {
            units: buildUnitComparisonAnalysis(
              trendRows,
              sensors,
              seriesConfig,
              comparisonLevel,
              unitsRange.start,
              unitsRange.end,
              selectedComparisonUnitIds,
            ),
          }
      : { monitor: buildMonitoringAnalysis(trendRows, seriesConfig, durationValue, durationUnit, requestedBucketUnit) };

    res.json({
      generatedAt: new Date().toISOString(),
      mode,
      scope: {
        level: scopeType,
        name: scopeName,
      },
      availableSensorTypes,
      availableComparisonLevels: getAvailableComparisonLevels(req.user.role),
      selection: {
        sensorTypes: selectedSensorTypes,
        comparisonLevel,
        comparisonUnitIds: selectedComparisonUnitIds,
      },
      ...payload,
    });
  } catch (err) {
    console.error('Trend analysis query failed:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// GET /api/sensors/stats?districtId=X&blockId=Y&panchayatId=Z
// NOTE: must be before /stats/:panchayatId and /:id to avoid conflict
router.get('/stats', authenticate, async (req, res) => {
  try {
    const { clause, params } = await resolveAggregateScope(req.user, req.query);
    const [sensorStats] = await db.query(
      `SELECT
        COUNT(*) as total,
        SUM(status='active') as active,
        SUM(status='inactive') as inactive,
        SUM(status='faulty') as faulty
       FROM sensors s
       LEFT JOIN locations lp ON lp.id = s.panchayat_id
       LEFT JOIN locations lb ON lb.id = lp.parent_id
       LEFT JOIN locations ld ON ld.id = lb.parent_id
       WHERE 1=1 ${clause}`,
      params
    );
    const [villagerCount] = await db.query(
      `SELECT COUNT(*) as total
       FROM villagers v
       LEFT JOIN locations p ON p.id = v.panchayat_id
       LEFT JOIN locations b ON b.id = p.parent_id
       LEFT JOIN locations d ON d.id = b.parent_id
       WHERE 1=1 ${clause.replaceAll('s.', 'v.').replaceAll('lb.', 'b.').replaceAll('ld.', 'd.')}`,
      params
    );

    res.json({
      sensors: sensorStats[0],
      villagers: villagerCount[0].total,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// GET /api/sensors/stats/:panchayatId - legacy panchayat dashboard stats
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
  const normalizedType = normalizeSensorType(type);

  if (!id || !normalizedType || !panchayat_id || !district_id) {
    return res.status(400).json({ error: 'id, type, panchayat_id, district_id required' });
  }
  if (latitude == null || longitude == null || latitude === '' || longitude === '') {
    return res.status(400).json({ error: 'latitude and longitude are required' });
  }
  if (req.user.location_id !== parseInt(panchayat_id)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    if (!(await ensureSensorTypeExists(normalizedType))) {
      return res.status(400).json({ error: 'Sensor type is not configured yet. Please create the type first.' });
    }

    await db.query(
      `INSERT INTO sensors (id, name, type, status, location_description, location, panchayat_id, villager_id, district_id)
       VALUES (?, ?, ?, ?, ?, ST_GeomFromText(CONCAT('POINT(', ?, ' ', ?, ')'), 4326), ?, ?, ?)`,
      [
        id,
        name || null,
        normalizedType,
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
    const nextType = type != null ? normalizeSensorType(type) : existing[0].type;

    if (!nextType) {
      return res.status(400).json({ error: 'type is required' });
    }

    if (!(await ensureSensorTypeExists(nextType))) {
      return res.status(400).json({ error: 'Sensor type is not configured yet. Please create the type first.' });
    }

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
        nextType,
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
