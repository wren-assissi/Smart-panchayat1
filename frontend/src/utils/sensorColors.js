// Returns a hex color based on sensor type and value
export function getSensorColor(type, value, config = null) {
  if (value == null) return '#6b7280'; // gray - no data

  switch (type) {
    case 'Temp':         return tempColor(value);
    case 'WaterPH':      return phColor(value, 7, 6.5, 8.5);
    case 'SoilPH':       return phColor(value, 6.8, 6, 7.5);
    case 'AirQuality':   return aqiColor(value);
    case 'WaterSalinity':return salinityColor(value);
    case 'SoilMoisture': return soilMoistureColor(value);
    default:             return thresholdColor(value, config);
  }
}

export function getSensorSeverityScore(type, value, config = null) {
  if (value == null) return 0;

  switch (type) {
    case 'Temp':
      return clamp01(Math.abs(Number(value) - 22) / 18);
    case 'WaterPH':
      return clamp01(Math.abs(Number(value) - 7) / 4);
    case 'SoilPH':
      return clamp01(Math.abs(Number(value) - 6.8) / 4);
    case 'AirQuality':
      return clamp01(Number(value) / 300);
    case 'WaterSalinity':
      return clamp01(Number(value) / 1000);
    case 'SoilMoisture': {
      const numericValue = Number(value);
      if (numericValue < 20) return clamp01((20 - numericValue) / 20);
      if (numericValue <= 70) return 0;
      return clamp01((numericValue - 70) / 30);
    }
    default:
      return thresholdSeverity(value, config);
  }
}

export function getHeatmapColor(score) {
  const clampedScore = clamp01(score);
  const hue = 120 - (clampedScore * 120);
  const lightness = 46 + ((1 - clampedScore) * 8);
  return hslToHex(hue, 88, lightness);
}

// Temperature: Blue (cold) → Green → Yellow → Red (hot)
function tempColor(temp) {
  const clamped = Math.max(0, Math.min(40, temp));
  const ratio = clamped / 40;
  // hue: 240 (blue) → 0 (red)
  const hue = 240 - ratio * 240;
  return hslToHex(hue, 85, 50);
}

// pH: Green at ideal, Red at extremes (center-out)
function phColor(ph, center, idealLow, idealHigh) {
  const deviation = Math.abs(ph - center);
  const maxDeviation = 4;
  const ratio = Math.min(deviation / maxDeviation, 1);
  // Green (120°) → Yellow (60°) → Red (0°)
  const hue = 120 - ratio * 120;
  return hslToHex(hue, 80, 45);
}

// AQI: fixed threshold bands
function aqiColor(aqi) {
  if (aqi <= 50)  return '#22c55e'; // Good - green
  if (aqi <= 100) return '#eab308'; // Moderate - yellow
  if (aqi <= 200) return '#f97316'; // Unhealthy - orange
  if (aqi <= 300) return '#ef4444'; // Very unhealthy - red
  return '#7c3aed';                 // Hazardous - purple
}

// Salinity: Blue/Green → Yellow → Red (one-directional)
function salinityColor(ppm) {
  if (ppm <= 300)  return '#3b82f6'; // Blue - fresh
  if (ppm <= 1000) return '#eab308'; // Yellow - moderate
  return '#ef4444';                  // Red - high
}

// Soil Moisture: bell curve Red → Yellow → Green → Blue
function soilMoistureColor(pct) {
  if (pct < 20)  return '#ef4444'; // Dry - red
  if (pct < 40)  return '#eab308'; // Low - yellow
  if (pct < 70)  return '#22c55e'; // Ideal - green
  return '#3b82f6';                // Waterlogged - blue
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Returns a label describing the reading
export function getSensorLabel(type, value, config = null) {
  if (value == null) return 'No data';
  switch (type) {
    case 'Temp':          return `${value}°C`;
    case 'WaterPH':       return `pH ${value}`;
    case 'SoilPH':        return `pH ${value}`;
    case 'AirQuality':    return `AQI ${value}`;
    case 'WaterSalinity': return `${value} ppm`;
    case 'SoilMoisture':  return `${value}%`;
    default:              return config?.unit ? `${value}${config.unit}` : `${value}`;
  }
}

// Color legend ranges per type
export const SENSOR_LEGENDS = {
  Temp: [
    { color: '#3b82f6', label: '0–10°C Cold' },
    { color: '#22c55e', label: '15–25°C Mild' },
    { color: '#eab308', label: '25–30°C Warm' },
    { color: '#ef4444', label: '35–40°C Hot' },
  ],
  WaterPH: [
    { color: '#22c55e', label: '6.5–8.5 Safe' },
    { color: '#eab308', label: '5–6.5 / 8.5–9 Caution' },
    { color: '#ef4444', label: '<5 / >9 Unsafe' },
  ],
  SoilPH: [
    { color: '#22c55e', label: '6–7.5 Ideal' },
    { color: '#eab308', label: '5–6 / 7.5–8.5 Caution' },
    { color: '#ef4444', label: 'Outside range' },
  ],
  AirQuality: [
    { color: '#22c55e', label: '0–50 Good' },
    { color: '#eab308', label: '51–100 Moderate' },
    { color: '#f97316', label: '101–200 Unhealthy' },
    { color: '#ef4444', label: '201–300 Very Unhealthy' },
    { color: '#7c3aed', label: '301+ Hazardous' },
  ],
  WaterSalinity: [
    { color: '#3b82f6', label: '0–300 ppm Fresh' },
    { color: '#eab308', label: '300–1000 ppm Moderate' },
    { color: '#ef4444', label: '1000+ ppm High' },
  ],
  SoilMoisture: [
    { color: '#ef4444', label: '0–20% Dry' },
    { color: '#eab308', label: '20–40% Low' },
    { color: '#22c55e', label: '40–70% Ideal' },
    { color: '#3b82f6', label: '70–100% Waterlogged' },
  ],
};

function thresholdColor(value, config) {
  if (!config?.rule_type) return '#6b7280';

  const min = config.safe_min != null ? Number(config.safe_min) : null;
  const max = config.safe_max != null ? Number(config.safe_max) : null;

  if (config.rule_type === 'safe_range') {
    if (min == null || max == null) return '#6b7280';
    if (value < min || value > max) return '#ef4444';

    const span = Math.max(max - min, 1);
    const distanceFromCenter = Math.abs(value - ((min + max) / 2));
    const ratio = Math.min(distanceFromCenter / (span / 2 || 1), 1);
    return ratio > 0.7 ? '#eab308' : '#22c55e';
  }

  if (config.rule_type === 'upper_only') {
    if (max == null) return '#6b7280';
    if (value > max) return '#ef4444';
    return value > max * 0.85 ? '#eab308' : '#22c55e';
  }

  if (config.rule_type === 'lower_only') {
    if (min == null) return '#6b7280';
    if (value < min) return '#ef4444';
    return value < min * 1.15 ? '#eab308' : '#22c55e';
  }

  return '#6b7280';
}

function thresholdSeverity(value, config) {
  if (!config?.rule_type) return 0;

  const numericValue = Number(value);
  const min = config.safe_min != null ? Number(config.safe_min) : null;
  const max = config.safe_max != null ? Number(config.safe_max) : null;

  if (config.rule_type === 'safe_range') {
    if (min == null || max == null) return 0;
    if (numericValue < min) return clamp01((min - numericValue) / Math.max(Math.abs(min), 1));
    if (numericValue > max) return clamp01((numericValue - max) / Math.max(Math.abs(max), 1));

    const span = Math.max(max - min, 1);
    const center = (min + max) / 2;
    const distanceFromCenter = Math.abs(numericValue - center);
    return clamp01(distanceFromCenter / (span / 2 || 1));
  }

  if (config.rule_type === 'upper_only') {
    if (max == null) return 0;
    return numericValue <= max
      ? clamp01((numericValue / Math.max(max, 1)) * 0.3)
      : clamp01(0.3 + ((numericValue - max) / Math.max(Math.abs(max), 1)));
  }

  if (config.rule_type === 'lower_only') {
    if (min == null) return 0;
    return numericValue >= min
      ? clamp01(((Math.max(min, 1) / Math.max(numericValue, 1)) - 1) * 0.1)
      : clamp01((min - numericValue) / Math.max(Math.abs(min), 1));
  }

  return 0;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function getSensorLegend(type, config = null) {
  if (SENSOR_LEGENDS[type]) return SENSOR_LEGENDS[type];
  if (!config?.rule_type) return [];

  const unitSuffix = config.unit || '';
  const min = config.safe_min != null ? Number(config.safe_min) : null;
  const max = config.safe_max != null ? Number(config.safe_max) : null;

  if (config.rule_type === 'safe_range' && min != null && max != null) {
    return [
      { color: '#22c55e', label: `${min}-${max}${unitSuffix} Safe` },
      { color: '#eab308', label: `Near limit` },
      { color: '#ef4444', label: `<${min}${unitSuffix} or >${max}${unitSuffix} Unsafe` },
    ];
  }

  if (config.rule_type === 'upper_only' && max != null) {
    return [
      { color: '#22c55e', label: `<=${max}${unitSuffix} Safe` },
      { color: '#eab308', label: `Near ${max}${unitSuffix}` },
      { color: '#ef4444', label: `>${max}${unitSuffix} Unsafe` },
    ];
  }

  if (config.rule_type === 'lower_only' && min != null) {
    return [
      { color: '#22c55e', label: `>=${min}${unitSuffix} Safe` },
      { color: '#eab308', label: `Near ${min}${unitSuffix}` },
      { color: '#ef4444', label: `<${min}${unitSuffix} Unsafe` },
    ];
  }

  return [];
}
