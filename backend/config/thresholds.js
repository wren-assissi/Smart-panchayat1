const THRESHOLDS = {
  Temp: {
    safeMin: 15,
    safeMax: 35,
    unit: 'C',
  },
  WaterPH: {
    safeMin: 6.5,
    safeMax: 8.5,
    unit: 'pH',
  },
  SoilPH: {
    safeMin: 6.0,
    safeMax: 7.5,
    unit: 'pH',
  },
  AirQuality: {
    safeMin: 0,
    safeMax: 100,
    unit: 'AQI',
  },
  WaterSalinity: {
    safeMin: 0,
    safeMax: 300,
    unit: 'ppm',
  },
  SoilMoisture: {
    safeMin: 40,
    safeMax: 70,
    unit: '%',
  },
};

module.exports = THRESHOLDS;
