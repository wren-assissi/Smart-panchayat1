import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Clock3, MapPin, ShieldAlert, Siren } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import Sidebar from '../components/dashboard/Sidebar';
import { getSensors, getThresholdBreaches, getVillagers } from '../api';
import { useAuth } from '../context/AuthContext';
import { usePanchayat } from '../context/PanchayatContext';

const RANGE_OPTIONS = ['24h', '7d', '30d'];
const GROUP_OPTIONS = [
  { value: 'sensor', label: 'Sensor' },
  { value: 'panchayat', label: 'Panchayat' },
  { value: 'block', label: 'Block' },
  { value: 'district', label: 'District' },
];
const TYPE_OPTIONS = ['All', 'Temp', 'WaterPH', 'SoilPH', 'AirQuality', 'WaterSalinity', 'SoilMoisture'];

function formatHours(value) {
  return `${Number(value || 0).toFixed(2)}h`;
}

function formatTimestamp(value) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

function getGoogleMapsUrl(latitude, longitude) {
  if (latitude == null || longitude == null) return null;
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedPanchayat } = usePanchayat();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [villagers, setVillagers] = useState([]);
  const [sensors, setSensors] = useState([]);
  const [sidebarLoading, setSidebarLoading] = useState(false);

  const [range, setRange] = useState('7d');
  const [groupBy, setGroupBy] = useState(user?.role === 'state' ? 'district' : 'panchayat');
  const [type, setType] = useState('All');
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSidebarData = useCallback(async () => {
    if (!selectedPanchayat?.id) {
      setVillagers([]);
      setSensors([]);
      return;
    }

    setSidebarLoading(true);
    try {
      const [vData, sData] = await Promise.all([
        getVillagers(selectedPanchayat.id),
        getSensors(selectedPanchayat.id),
      ]);
      setVillagers(vData);
      setSensors(sData);
    } catch {
      setVillagers([]);
      setSensors([]);
    } finally {
      setSidebarLoading(false);
    }
  }, [selectedPanchayat?.id]);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getThresholdBreaches({
        range,
        groupBy,
        ...(type !== 'All' ? { type } : {}),
      });
      setAnalytics(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load threshold analytics');
    } finally {
      setLoading(false);
    }
  }, [groupBy, range, type]);

  useEffect(() => {
    fetchSidebarData();
  }, [fetchSidebarData]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const onRefresh = useCallback(() => {
    fetchSidebarData();
    fetchAnalytics();
  }, [fetchAnalytics, fetchSidebarData]);

  const summaryCards = useMemo(() => {
    const summary = analytics?.summary || {};
    return [
      {
        label: 'Sensors Analyzed',
        value: summary.totalSensorsAnalyzed ?? '—',
        icon: <BarChart3 className="w-5 h-5 text-blue-300" />,
        className: 'border-blue-800/50 bg-blue-950/30',
      },
      {
        label: 'Sensors With Breaches',
        value: summary.sensorsWithBreaches ?? '—',
        icon: <ShieldAlert className="w-5 h-5 text-amber-300" />,
        className: 'border-amber-800/50 bg-amber-950/20',
      },
      {
        label: 'Total Breaches',
        value: summary.totalBreaches ?? '—',
        icon: <Siren className="w-5 h-5 text-red-300" />,
        className: 'border-red-800/50 bg-red-950/20',
      },
      {
        label: 'Unsafe Duration',
        value: formatHours(summary.totalUnsafeHours),
        icon: <Clock3 className="w-5 h-5 text-green-300" />,
        className: 'border-green-800/50 bg-green-950/20',
      },
    ];
  }, [analytics]);

  return (
    <div className="h-screen flex overflow-hidden bg-gray-950">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((current) => !current)}
        villagers={villagers}
        sensors={sensors}
        onRefresh={onRefresh}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="flex-shrink-0 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm px-6 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-green-500/80">Analytics</div>
              <h1 className="mt-2 text-2xl font-bold text-white">Threshold Breach Analytics</h1>
              <p className="mt-1 text-sm text-gray-400">
                Review unsafe durations, repeated threshold breaches, and affected areas for your current access level.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select value={range} onChange={(e) => setRange(e.target.value)} className="input-field min-w-28">
                {RANGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="input-field min-w-36">
                {GROUP_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select value={type} onChange={(e) => setType(e.target.value)} className="input-field min-w-40">
                {TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <button onClick={fetchAnalytics} className="btn-secondary">
                Refresh
              </button>
              <button onClick={() => navigate('/dashboard')} className="btn-primary">
                Back to Dashboard
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6 fade-in-up">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {summaryCards.map((card) => (
                <section key={card.label} className={`rounded-2xl border p-4 ${card.className}`}>
                  <div className="flex items-center justify-between">
                    {card.icon}
                    {loading && <span className="text-xs text-gray-500">Loading</span>}
                  </div>
                  <div className="mt-4 text-3xl font-bold text-white">{card.value}</div>
                  <div className="mt-1 text-sm text-gray-400">{card.label}</div>
                </section>
              ))}
            </div>

            {error && (
              <div className="rounded-2xl border border-red-800/50 bg-red-950/20 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <section className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-6">
              <div className="card p-5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <h2 className="text-lg font-semibold text-white">Top Breached Sensors</h2>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-gray-500 border-b border-gray-800">
                      <tr>
                        <th className="px-3 py-3 font-medium">Sensor</th>
                        <th className="px-3 py-3 font-medium">Location</th>
                        <th className="px-3 py-3 font-medium">Type</th>
                        <th className="px-3 py-3 font-medium">Breaches</th>
                        <th className="px-3 py-3 font-medium">Unsafe For</th>
                        <th className="px-3 py-3 font-medium">Longest</th>
                        <th className="px-3 py-3 font-medium">Last Breach</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(analytics?.topSensors || []).length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                            {loading ? 'Loading breach analytics...' : 'No threshold breaches found for this filter.'}
                          </td>
                        </tr>
                      ) : (analytics?.topSensors || []).map((sensor) => (
                        <tr key={sensor.sensorId} className="border-b border-gray-900/80">
                          <td className="px-3 py-3">
                            <div className="font-mono text-gray-100">{sensor.sensorId}</div>
                            <div className="text-xs text-gray-500">{sensor.sensorName}</div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="text-gray-200">{sensor.locationDescription || 'No description'}</div>
                            {getGoogleMapsUrl(sensor.latitude, sensor.longitude) ? (
                              <a
                                href={getGoogleMapsUrl(sensor.latitude, sensor.longitude)}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 inline-flex items-center gap-1 text-xs text-green-400 hover:text-green-300"
                              >
                                <MapPin className="w-3 h-3" />
                                Open in Google Maps
                              </a>
                            ) : (
                              <div className="mt-1 text-xs text-gray-500">No coordinates</div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-gray-300">{sensor.type}</td>
                          <td className="px-3 py-3 text-red-300 font-semibold">{sensor.breachCount}</td>
                          <td className="px-3 py-3 text-gray-300">{formatHours(sensor.totalUnsafeHours)}</td>
                          <td className="px-3 py-3 text-gray-300">{formatHours(sensor.longestUnsafeHours)}</td>
                          <td className="px-3 py-3 text-gray-500">{formatTimestamp(sensor.lastBreachAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card p-5">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-green-400" />
                  <h2 className="text-lg font-semibold text-white">Repeatedly Affected Areas</h2>
                </div>
                <div className="mt-4 space-y-3">
                  {(analytics?.groups || []).length === 0 ? (
                    <div className="rounded-xl border border-gray-800 bg-gray-950/50 px-4 py-5 text-sm text-gray-500">
                      {loading ? 'Loading area impact...' : 'No affected areas for this filter.'}
                    </div>
                  ) : (analytics?.groups || []).slice(0, 8).map((group) => (
                    <div key={`${group.level}-${group.id}`} className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold text-white">{group.name}</div>
                          <div className="text-xs uppercase tracking-[0.16em] text-gray-500">{group.level}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-red-300">{group.breachCount}</div>
                          <div className="text-xs text-gray-500">breaches</div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2">
                          <div className="text-xs text-gray-500">Affected Sensors</div>
                          <div className="mt-1 font-semibold text-gray-200">{group.affectedSensors}</div>
                        </div>
                        <div className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2">
                          <div className="text-xs text-gray-500">Unsafe Duration</div>
                          <div className="mt-1 font-semibold text-gray-200">{formatHours(group.totalUnsafeHours)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="card p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Detailed Sensor Breaches</h2>
                  <p className="mt-1 text-sm text-gray-400">
                    Current role: <span className="capitalize text-gray-300">{user?.role}</span>
                    {selectedPanchayat?.name ? ` · Sidebar panchayat: ${selectedPanchayat.name}` : ''}
                    {sidebarLoading ? ' · Refreshing sidebar data...' : ''}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 text-xs text-gray-400">
                  Threshold source: backend safe ranges
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-500 border-b border-gray-800">
                    <tr>
                      <th className="px-3 py-3 font-medium">Sensor</th>
                      <th className="px-3 py-3 font-medium">Location</th>
                      <th className="px-3 py-3 font-medium">Threshold</th>
                      <th className="px-3 py-3 font-medium">Breaches</th>
                      <th className="px-3 py-3 font-medium">Unsafe For</th>
                      <th className="px-3 py-3 font-medium">Longest</th>
                      <th className="px-3 py-3 font-medium">Current</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(analytics?.sensors || []).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                          {loading ? 'Loading sensor analytics...' : 'No sensors matched the selected analytics filter.'}
                        </td>
                      </tr>
                    ) : (analytics?.sensors || []).map((sensor) => (
                      <tr key={sensor.sensorId} className="border-b border-gray-900/80">
                        <td className="px-3 py-3">
                          <div className="font-mono text-gray-100">{sensor.sensorId}</div>
                          <div className="text-xs text-gray-500">{sensor.sensorName}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-gray-200">{sensor.panchayat.name}</div>
                          <div className="text-xs text-gray-500">{sensor.block.name} · {sensor.district.name}</div>
                          <div className="mt-1 text-xs text-gray-400">{sensor.locationDescription || 'No location description'}</div>
                          {getGoogleMapsUrl(sensor.latitude, sensor.longitude) ? (
                            <a
                              href={getGoogleMapsUrl(sensor.latitude, sensor.longitude)}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-flex items-center gap-1 text-xs text-green-400 hover:text-green-300"
                            >
                              <MapPin className="w-3 h-3" />
                              Open in Google Maps
                            </a>
                          ) : (
                            <div className="mt-1 text-xs text-gray-500">No coordinates</div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-gray-300">
                          {sensor.threshold.safeMin} to {sensor.threshold.safeMax} {sensor.threshold.unit}
                        </td>
                        <td className="px-3 py-3 font-semibold text-red-300">{sensor.breachCount}</td>
                        <td className="px-3 py-3 text-gray-300">{formatHours(sensor.totalUnsafeHours)}</td>
                        <td className="px-3 py-3 text-gray-300">{formatHours(sensor.longestUnsafeHours)}</td>
                        <td className="px-3 py-3">
                          <span className={sensor.unsafeNow ? 'status-faulty' : 'status-active'}>
                            {sensor.unsafeNow ? 'Unsafe now' : 'Safe now'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
