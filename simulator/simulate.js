const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../backend/.env' });

// InfluxDB setup
const client = new InfluxDB({
  url: process.env.INFLUX_URL,
  token: process.env.INFLUX_TOKEN,
});

const writeApi = client.getWriteApi(
  process.env.INFLUX_ORG,
  process.env.INFLUX_BUCKET,
  'ms'
);

// MySQL setup
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'smart_panchayat',
  waitForConnections: true,
  connectionLimit: 3,
});

// Realistic value ranges per sensor type
const TYPE_RANGES = {
  Temp:          { min: 24,  max: 38,  unit: '°C'  },
  WaterPH:       { min: 6.5, max: 8.5, unit: 'pH'  },
  WaterSalinity: { min: 0.1, max: 2.5, unit: 'ppt' },
  SoilMoisture:  { min: 20,  max: 80,  unit: '%'   },
  SoilPH:        { min: 5.5, max: 7.5, unit: 'pH'  },
  AirQuality:    { min: 15,  max: 150, unit: 'AQI' },
  Humidity:      { min: 40,  max: 95,  unit: '%'   },
  Rainfall:      { min: 0,   max: 50,  unit: 'mm'  },
  WaterLevel:    { min: 0,   max: 10,  unit: 'm'   },
  Light:         { min: 100, max: 1000,unit: 'lux' },
  // fallback for unknown types
  default:       { min: 0,   max: 100, unit: ''    },
};

// Tracks previous value per sensor for realistic drift
const prevValues = {};

function nextValue(sensorId, type) {
  const range = TYPE_RANGES[type] || TYPE_RANGES.default;
  const span = range.max - range.min;
  const prev = prevValues[sensorId] ?? (range.min + span / 2);
  // Drift up to 2% of range per tick
  const drift = (Math.random() - 0.5) * span * 0.04;
  const next = Math.min(range.max, Math.max(range.min, prev + drift));
  prevValues[sensorId] = next;
  return parseFloat(next.toFixed(2));
}

// Fetch all active sensors with their district name
async function fetchActiveSensors() {
  const [rows] = await pool.query(
    `SELECT s.id, s.type, l.name as district_name
     FROM sensors s
     JOIN locations l ON l.id = s.district_id
     WHERE s.status = 'active'`
  );
  return rows;
}

// Write one reading per sensor
async function writeSensorReadings(sensors) {
  if (sensors.length === 0) {
    console.log('⚠️  No active sensors found');
    return;
  }

  const timestamp = new Date();

  for (const sensor of sensors) {
    const measurement = `${sensor.district_name}_${sensor.type}`;
    const value = nextValue(sensor.id, sensor.type);
    const range = TYPE_RANGES[sensor.type] || TYPE_RANGES.default;

    const point = new Point(measurement)
      .tag('sensor_id', sensor.id)
      .floatField('value', value)
      .timestamp(timestamp);

    writeApi.writePoint(point);
    console.log(`  ${sensor.id.padEnd(20)} ${measurement.padEnd(30)} → ${value} ${range.unit}`);
  }

  await writeApi.flush();
  console.log(`✅ Written ${sensors.length} points at ${timestamp.toISOString()}\n`);
}

// ── Main loop ────────────────────────────────────────────────────────────────

let activeSensors = [];
let sensorCount = 0;

// Refresh sensor list from MySQL every 30 seconds
async function refreshSensors() {
  try {
    activeSensors = await fetchActiveSensors();
    if (activeSensors.length !== sensorCount) {
      sensorCount = activeSensors.length;
      console.log(`🔄 Sensor list updated — ${sensorCount} active sensors\n`);
    }
  } catch (err) {
    console.error('❌ Failed to fetch sensors from MySQL:', err.message);
  }
}

async function main() {
  console.log('🌿 Smart Panchayat Simulator starting...');
  console.log(`   InfluxDB: ${process.env.INFLUX_URL}`);
  console.log(`   Bucket:   ${process.env.INFLUX_BUCKET}`);
  console.log(`   MySQL:    ${process.env.DB_HOST}/${process.env.DB_NAME}`);
  console.log(`   Write interval:  10s`);
  console.log(`   Sensor refresh:  30s\n`);

  // Initial load
  await refreshSensors();

  // Write immediately on start
  await writeSensorReadings(activeSensors);

  // Write every 10 seconds
  const writeInterval = setInterval(async () => {
    await writeSensorReadings(activeSensors);
  }, 10000);

  // Refresh sensor list every 30 seconds
  const refreshInterval = setInterval(refreshSensors, 30000);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Stopping simulator...');
    clearInterval(writeInterval);
    clearInterval(refreshInterval);
    await writeApi.close();
    await pool.end();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('❌ Simulator crashed:', err);
  process.exit(1);
});