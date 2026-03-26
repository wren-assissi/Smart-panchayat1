import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Pane, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../context/AuthContext';
import { usePanchayat } from '../context/PanchayatContext';
import { getMapSensors, getMapReadings, getSensorTypes } from '../api';
import { getSensorColor, getSensorLabel, getSensorLegend, getSensorSeverityScore, getHeatmapColor } from '../utils/sensorColors';
import { Layers, RefreshCw, ChevronLeft, Loader, Cpu, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// ── SVG pin icon ─────────────────────────────────────────────────────────────
function createPinIcon(color, value, type, config) {
  const label = value != null ? getSensorLabel(type, value, config) : '?';
  const displayLabel = label.length > 7 ? label.slice(0, 7) : label;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="44" height="56" viewBox="0 0 44 56">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.4"/>
        </filter>
      </defs>
      <path d="M22 2 C12 2 4 10 4 20 C4 34 22 54 22 54 C22 54 40 34 40 20 C40 10 32 2 22 2Z"
        fill="${color}" stroke="white" stroke-width="2" filter="url(#shadow)"/>
      <circle cx="22" cy="20" r="10" fill="white" opacity="0.92"/>
      <text x="22" y="24" text-anchor="middle"
        font-family="monospace" font-size="7" font-weight="bold" fill="${color}">
        ${displayLabel}
      </text>
    </svg>
  `;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [44, 56],
    iconAnchor: [22, 54],
    popupAnchor: [0, -56],
  });
}

// ── Boundary + mask layer ────────────────────────────────────────────────────
function BoundaryMask({ targetFeature }) {
  const map = useMap();

  useEffect(() => {
    if (!targetFeature) return;

    const worldCoords = [[-90, -180], [-90, 180], [90, 180], [90, -180], [-90, -180]];
    const geometry = targetFeature.geometry;
    let maskFeature = null;

    if (geometry?.type === 'Polygon') {
      maskFeature = {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [worldCoords, geometry.coordinates[0]],
        },
      };
    } else if (geometry?.type === 'MultiPolygon') {
      maskFeature = {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            worldCoords,
            ...geometry.coordinates.map((polygon) => polygon[0]),
          ],
        },
      };
    }

    const maskLayer = maskFeature ? L.geoJSON(maskFeature, {
      style: {
        color: 'transparent',
        fillColor: '#030712',
        fillOpacity: 0.68,
        fillRule: 'evenodd',
      },
      interactive: false,
    }).addTo(map) : null;

    // Red boundary outline on top
    const boundaryLayer = L.geoJSON(targetFeature, {
      style: {
        color: '#ef4444',
        weight: 2.5,
        opacity: 1,
        fillOpacity: 0,
      },
      interactive: false,
    }).addTo(map);

    maskLayer?.bringToFront();
    boundaryLayer.bringToFront();

    return () => {
      if (maskLayer) map.removeLayer(maskLayer);
      map.removeLayer(boundaryLayer);
    };
  }, [targetFeature, map]);

  return null;
}

// ── Fit map to boundary ──────────────────────────────────────────────────────
function FitBounds({ feature }) {
  const map = useMap();
  useEffect(() => {
    if (!feature) return;
    try {
      const layer = L.geoJSON(feature);
      map.fitBounds(layer.getBounds(), { padding: [40, 40] });
    } catch {}
  }, [feature, map]);
  return null;
}

function buildHeatmapHotspots(sensors, readings, selectedType, selectedTypeDefinition) {
  const grouped = new Map();

  sensors.forEach((sensor) => {
    const latitude = Number.parseFloat(sensor.latitude);
    const longitude = Number.parseFloat(sensor.longitude);
    const reading = readings[sensor.id];

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || reading == null) return;

    const key = `${latitude.toFixed(3)}:${longitude.toFixed(3)}`;
    const severity = getSensorSeverityScore(selectedType, reading, selectedTypeDefinition);

    if (!grouped.has(key)) {
      grouped.set(key, {
        latitude: 0,
        longitude: 0,
        severityTotal: 0,
        readingTotal: 0,
        readingCount: 0,
        sensors: [],
      });
    }

    const group = grouped.get(key);
    group.latitude += latitude;
    group.longitude += longitude;
    group.severityTotal += severity;
    group.readingTotal += reading;
    group.readingCount += 1;
    group.sensors.push(sensor);
  });

  return Array.from(grouped.values())
    .map((group) => ({
      latitude: group.latitude / group.readingCount,
      longitude: group.longitude / group.readingCount,
      averageSeverity: group.severityTotal / group.readingCount,
      averageReading: group.readingTotal / group.readingCount,
      sensorCount: group.readingCount,
      sensors: group.sensors,
    }))
    .sort((a, b) => b.averageSeverity - a.averageSeverity);
}

function HeatmapSpot({ spot, selectedType, selectedTypeDefinition }) {
  const color = getHeatmapColor(spot.averageSeverity);
  const outerRadius = 1600 + (spot.averageSeverity * 3600) + (Math.max(spot.sensorCount - 1, 0) * 250);
  const midRadius = outerRadius * 0.65;
  const innerRadius = outerRadius * 0.32;
  const averageLabel = getSensorLabel(selectedType, Number(spot.averageReading.toFixed(2)), selectedTypeDefinition);
  const severityLabel = spot.averageSeverity >= 0.75
    ? 'High'
    : spot.averageSeverity >= 0.4
      ? 'Moderate'
      : 'Low';

  return (
    <>
      <Circle
        center={[spot.latitude, spot.longitude]}
        radius={outerRadius}
        pathOptions={{ stroke: false, fillColor: color, fillOpacity: 0.12 }}
      />
      <Circle
        center={[spot.latitude, spot.longitude]}
        radius={midRadius}
        pathOptions={{ stroke: false, fillColor: color, fillOpacity: 0.2 }}
      />
      <Circle
        center={[spot.latitude, spot.longitude]}
        radius={innerRadius}
        pathOptions={{ stroke: false, fillColor: color, fillOpacity: 0.34 }}
      >
        <Popup minWidth={220}>
          <div style={{ fontFamily: 'Sora, system-ui, sans-serif', minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
              <span style={{ fontWeight: 700, color: '#111827', fontSize: 13 }}>
                {selectedType} Heatmap Hotspot
              </span>
            </div>
            <table style={{ width: '100%', fontSize: 11, color: '#374151', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 600, paddingRight: 8, paddingBottom: 4, color: '#6b7280' }}>Average reading</td>
                  <td style={{ paddingBottom: 4 }}>{averageLabel}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, paddingRight: 8, paddingBottom: 4, color: '#6b7280' }}>Average severity</td>
                  <td style={{ paddingBottom: 4 }}>{severityLabel}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, paddingRight: 8, paddingBottom: 4, color: '#6b7280' }}>Sensors included</td>
                  <td style={{ paddingBottom: 4 }}>{spot.sensorCount}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, paddingRight: 8, color: '#6b7280', verticalAlign: 'top' }}>Sensor IDs</td>
                  <td>{spot.sensors.map((sensor) => sensor.id).join(', ')}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Popup>
      </Circle>
    </>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function MapPage() {
  const { user } = useAuth();
  const { selectedDistrict } = usePanchayat();
  const navigate = useNavigate();

  const [sensorTypes, setSensorTypes] = useState([]);
  const [sensorTypeConfig, setSensorTypeConfig] = useState({});
  const [selectedType, setSelectedType] = useState('');
  const [mapMode, setMapMode] = useState('pins');
  const [sensors, setSensors] = useState([]);
  const [readings, setReadings] = useState({});

  const [stateGeoJson, setStateGeoJson] = useState(null);
  const [districtGeoJson, setDistrictGeoJson] = useState(null);
  const [targetFeature, setTargetFeature] = useState(null);

  const [loading, setLoading] = useState(false);
  const [loadingReadings, setLoadingReadings] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [dataError, setDataError] = useState('');

  // ── Load both GeoJSON files once ──────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch('/kerala.geojson').then(r => r.json()),
      fetch('/districts.geojson').then(r => r.json()),
    ])
      .then(([stateData, districtData]) => {
        setStateGeoJson(stateData);
        setDistrictGeoJson(districtData);
      })
      .catch(() => setGeoError('Failed to load boundary files. Make sure kerala.geojson and districts.geojson are in frontend/public/'));
  }, []);

  useEffect(() => {
    let active = true;

    const loadSensorTypes = async () => {
      try {
        const rows = await getSensorTypes();
        if (!active) return;

        const types = rows.map((row) => row.sensor_key);
        const typeConfig = Object.fromEntries(
          rows.map((row) => [row.sensor_key, row])
        );
        setSensorTypes(types);
        setSensorTypeConfig(typeConfig);
        setSelectedType((current) => current || types[0] || '');
      } catch {
        if (!active) return;
        setSensorTypes([]);
        setSensorTypeConfig({});
      }
    };

    loadSensorTypes();

    return () => {
      active = false;
    };
  }, []);

  // ── Select boundary based on role ─────────────────────────────────────────
  useEffect(() => {
    if (!stateGeoJson || !districtGeoJson) return;

    if (user.role === 'state') {
      // Kerala state boundary — state.geojson has a single feature with ST_NM: "Kerala"
      const keralaFeature = stateGeoJson.features.find(
        f => f.properties?.ST_NM?.toLowerCase() === 'kerala'
      ) || stateGeoJson.features[0];
      setTargetFeature(keralaFeature);
    } else {
      // District, block and panchayat all show their district boundary
      // district.geojson uses property key "DISTRICT"
      const districtName = selectedDistrict?.name || user.location_name;
      if (!districtName) return;

      const feature = districtGeoJson.features.find(
        f => f.properties?.DISTRICT?.toLowerCase() === districtName.toLowerCase()
      );

      if (feature) {
        setTargetFeature(feature);
      } else {
        // Fallback: try partial match in case of minor spelling difference
        const fallback = districtGeoJson.features.find(f =>
          f.properties?.DISTRICT?.toLowerCase().includes(districtName.toLowerCase()) ||
          districtName.toLowerCase().includes(f.properties?.DISTRICT?.toLowerCase())
        );
        setTargetFeature(fallback || null);
        if (!fallback) {
          console.warn(`District boundary not found for: "${districtName}"`);
        }
      }
    }
  }, [stateGeoJson, districtGeoJson, user, selectedDistrict]);

  // ── Load sensors + readings ───────────────────────────────────────────────
  const loadSensors = useCallback(async () => {
    if (!selectedType) {
      setSensors([]);
      setReadings({});
      return;
    }

    setLoading(true);
    setDataError('');
    setSensors([]);
    setReadings({});
    try {
      const data = await getMapSensors(selectedType);
      setSensors(data);

      if (data.length > 0) {
        setLoadingReadings(true);
        try {
          const readingData = await getMapReadings(
            data.map(s => ({ id: s.id, type: s.type, district_name: s.district_name }))
          );
          setReadings(readingData);
        } catch {
          // Readings failing is non-fatal — pins still show without values
        } finally {
          setLoadingReadings(false);
        }
      }
    } catch (err) {
      setDataError(err.response?.data?.error || 'Failed to load sensor data');
    } finally {
      setLoading(false);
    }
  }, [selectedType]);

  useEffect(() => {
    loadSensors();
  }, [loadSensors]);

  // ── Auto-refresh readings every 15s ──────────────────────────────────────
  useEffect(() => {
    if (!sensors.length) return;
    const interval = setInterval(async () => {
      try {
        const readingData = await getMapReadings(
          sensors.map(s => ({ id: s.id, type: s.type, district_name: s.district_name }))
        );
        setReadings(readingData);
      } catch {}
    }, 15000);
    return () => clearInterval(interval);
  }, [sensors]);

  const roleLabel = {
    state: 'Kerala — State View',
    district: selectedDistrict?.name || user.location_name,
    block: user.location_name,
    panchayat: user.location_name,
  }[user.role] || user.location_name;

  const selectedTypeDefinition = sensorTypeConfig[selectedType] || null;
  const legend = getSensorLegend(selectedType, selectedTypeDefinition);
  const heatmapHotspots = buildHeatmapHotspots(sensors, readings, selectedType, selectedTypeDefinition);
  const error = geoError || dataError;

  return (
    <div className="h-screen flex flex-col bg-gray-950">

      {/* ── Top bar ── */}
      <div className="flex-shrink-0 flex items-center gap-4 px-4 py-3 bg-gray-900 border-b border-gray-800">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Dashboard
        </button>

        <div className="w-px h-5 bg-gray-700" />

        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-green-400" />
          <span className="text-sm font-semibold text-white">Sensor Map</span>
          <span className="text-xs text-gray-500 hidden sm:block">— {roleLabel}</span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-gray-700 bg-gray-800/80 p-0.5">
            <button
              onClick={() => setMapMode('pins')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mapMode === 'pins'
                  ? 'bg-green-500 text-gray-950'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              Pins
            </button>
            <button
              onClick={() => setMapMode('heatmap')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mapMode === 'heatmap'
                  ? 'bg-green-500 text-gray-950'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              Heatmap
            </button>
          </div>

          {/* Sensor type selector */}
          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-100 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500 cursor-pointer"
            disabled={sensorTypes.length === 0}
          >
            {sensorTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <button
            onClick={loadSensors}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Cpu className="w-3.5 h-3.5" />
            {loading ? '—' : `${sensors.length} sensors`}
          </div>
        </div>
      </div>

      {/* ── Map area ── */}
      <div className="flex-1 relative overflow-hidden">

        {/* Error toast */}
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-red-900/95 border border-red-700 text-red-300 px-4 py-2 rounded-lg text-sm max-w-sm text-center shadow-xl">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        {/* Loading toast */}
        {(loading || loadingReadings) && !error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-gray-900/95 border border-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm shadow-xl">
            <Loader className="w-4 h-4 animate-spin text-green-400" />
            {loading ? 'Loading sensors...' : 'Fetching live readings...'}
          </div>
        )}

        <MapContainer
          center={[10.5, 76.27]}
          zoom={9}
          style={{ width: '100%', height: '100%' }}
          zoomControl={true}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />

          {/* Boundary mask + red outline */}
          {targetFeature && (
            <>
              <BoundaryMask targetFeature={targetFeature} />
              <FitBounds feature={targetFeature} />
            </>
          )}

          {mapMode === 'pins' && sensors.map(sensor => {
            const value = readings[sensor.id] ?? null;
            const color = getSensorColor(selectedType, value, selectedTypeDefinition);
            const icon = createPinIcon(color, value, selectedType, selectedTypeDefinition);

            return (
              <Marker
                key={sensor.id}
                position={[parseFloat(sensor.latitude), parseFloat(sensor.longitude)]}
                icon={icon}
              >
                <Popup minWidth={210}>
                  <div style={{ fontFamily: 'Sora, system-ui, sans-serif', minWidth: 210 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      marginBottom: 10, paddingBottom: 8,
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%',
                        backgroundColor: color, flexShrink: 0
                      }} />
                      <span style={{ fontWeight: 700, color: '#111827', fontSize: 13 }}>
                        {sensor.id}
                      </span>
                    </div>

                    <div style={{
                      textAlign: 'center', padding: '10px 8px', marginBottom: 10,
                      borderRadius: 8, backgroundColor: color + '18',
                      border: `1px solid ${color}40`
                    }}>
                      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>
                        {value != null ? getSensorLabel(selectedType, value, selectedTypeDefinition) : '—'}
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>
                        {value != null ? 'Live reading' : 'No data yet'}
                      </div>
                    </div>

                    <table style={{ width: '100%', fontSize: 11, color: '#374151', borderCollapse: 'collapse' }}>
                      <tbody>
                        {sensor.name && (
                          <tr>
                            <td style={{ fontWeight: 600, paddingRight: 8, paddingBottom: 4, color: '#6b7280', whiteSpace: 'nowrap' }}>Name</td>
                            <td style={{ paddingBottom: 4 }}>{sensor.name}</td>
                          </tr>
                        )}
                        <tr>
                          <td style={{ fontWeight: 600, paddingRight: 8, paddingBottom: 4, color: '#6b7280' }}>Type</td>
                          <td style={{ paddingBottom: 4 }}>{sensor.type}</td>
                        </tr>
                        <tr>
                          <td style={{ fontWeight: 600, paddingRight: 8, paddingBottom: 4, color: '#6b7280' }}>Status</td>
                          <td style={{ paddingBottom: 4, color: sensor.status === 'active' ? '#16a34a' : '#9ca3af', fontWeight: 600 }}>
                            {sensor.status}
                          </td>
                        </tr>
                        {sensor.villager_name && (
                          <tr>
                            <td style={{ fontWeight: 600, paddingRight: 8, paddingBottom: 4, color: '#6b7280' }}>Villager</td>
                            <td style={{ paddingBottom: 4 }}>{sensor.villager_name}</td>
                          </tr>
                        )}
                        {sensor.panchayat_name && (
                          <tr>
                            <td style={{ fontWeight: 600, paddingRight: 8, paddingBottom: 4, color: '#6b7280' }}>Panchayat</td>
                            <td style={{ paddingBottom: 4 }}>{sensor.panchayat_name}</td>
                          </tr>
                        )}
                        {sensor.district_name && (
                          <tr>
                            <td style={{ fontWeight: 600, paddingRight: 8, paddingBottom: 4, color: '#6b7280' }}>District</td>
                            <td style={{ paddingBottom: 4 }}>{sensor.district_name}</td>
                          </tr>
                        )}
                        {sensor.location_description && (
                          <tr>
                            <td style={{ fontWeight: 600, paddingRight: 8, paddingBottom: 4, color: '#6b7280', verticalAlign: 'top' }}>Location</td>
                            <td style={{ paddingBottom: 4 }}>{sensor.location_description}</td>
                          </tr>
                        )}
                        <tr>
                          <td style={{ fontWeight: 600, paddingRight: 8, color: '#6b7280' }}>GPS</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 10 }}>
                            {parseFloat(sensor.latitude).toFixed(4)}, {parseFloat(sensor.longitude).toFixed(4)}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <div style={{
                      marginTop: 8, paddingTop: 8,
                      borderTop: '1px solid #e5e7eb',
                      fontSize: 10, color: '#9ca3af', textAlign: 'center'
                    }}>
                      Auto-refreshes every 15s
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {mapMode === 'heatmap' && (
            <Pane name="heatmap-pane" style={{ zIndex: 430 }}>
              {heatmapHotspots.map((spot, index) => (
                <HeatmapSpot
                  key={`${spot.latitude}-${spot.longitude}-${index}`}
                  spot={spot}
                  selectedType={selectedType}
                  selectedTypeDefinition={selectedTypeDefinition}
                />
              ))}
            </Pane>
          )}
        </MapContainer>

        {/* ── Legend ── */}
        <div style={{ zIndex: 400 }} className="absolute bottom-6 right-4 bg-gray-900/95 border border-gray-700 rounded-xl p-3 min-w-[170px] shadow-xl">
          <div className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2.5">
            {mapMode === 'pins' ? `${selectedType} Legend` : `${selectedType} Heatmap`}
          </div>
          <div className="space-y-1.5">
            {mapMode === 'pins' ? (
              <>
                {legend.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-xs text-gray-400">{item.label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1.5 mt-1 border-t border-gray-700">
                  <div className="w-3 h-3 rounded-full flex-shrink-0 bg-gray-500" />
                  <span className="text-xs text-gray-500">No data</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getHeatmapColor(0.2) }} />
                  <span className="text-xs text-gray-400">Low average severity</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getHeatmapColor(0.5) }} />
                  <span className="text-xs text-gray-400">Moderate average severity</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getHeatmapColor(0.85) }} />
                  <span className="text-xs text-gray-400">High average severity</span>
                </div>
                <div className="pt-1.5 mt-1 border-t border-gray-700 text-xs text-gray-500 leading-relaxed">
                  Hotspots blend nearby sensor readings and use the average severity for each area.
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Role / location badge ── */}
        <div style={{ zIndex: 400 }} className="absolute top-4 left-4 bg-gray-900/95 border border-gray-700 rounded-lg px-3 py-2 shadow-xl">
          <div className="text-xs text-gray-500 capitalize">{user.role} view</div>
          <div className="text-sm font-semibold text-white mt-0.5">{roleLabel}</div>
        </div>

        {/* ── No sensors message ── */}
        {!loading && sensors.length === 0 && !error && (
          <div style={{ zIndex: 400 }} className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-900/95 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-400 shadow-xl">
            No {selectedType} sensors found for your access level
          </div>
        )}
      </div>
    </div>
  );
}
