import React, { useState, useEffect } from 'react';
import { Search, Cpu, User, MapPin, X, Loader, TrendingUp, WifiOff, Edit2, Trash2, Check } from 'lucide-react';
import { getSensor, getSensorHistory, deleteSensor } from '../../api';
import { useAuth } from '../../context/AuthContext';
import SensorFormModal from './SensorFormModal';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const STATUS_CONFIG = {
  active:   { label: 'Active',   className: 'status-active',   dot: 'bg-green-400' },
  inactive: { label: 'Inactive', className: 'status-inactive', dot: 'bg-gray-500' },
  faulty:   { label: 'Faulty',   className: 'status-faulty',   dot: 'bg-red-400' },
};

const RANGE_OPTIONS = ['1h', '6h', '24h', '7d'];

export default function SensorSearch({ sensors, panchayatId, onRefresh }) {
  const { canWrite } = useAuth();
  const [query, setQuery] = useState('');
  const [filtered, setFiltered] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [selected, setSelected] = useState(null);
  const [sensorDetail, setSensorDetail] = useState(null);
  const [history, setHistory] = useState([]);
  const [range, setRange] = useState('24h');
  const [loading, setLoading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [sensorModal, setSensorModal] = useState({ open: false, data: null });

  useEffect(() => {
    if (!query.trim()) {
      setFiltered([]);
      setShowResults(false);
    } else {
      setFiltered(sensors.filter(s =>
        s.id.toLowerCase().includes(query.toLowerCase()) ||
        (s.name && s.name.toLowerCase().includes(query.toLowerCase())) ||
        s.type.toLowerCase().includes(query.toLowerCase())
      ));
      setShowResults(true);
    }
  }, [query, sensors]);

  const openSensor = async (s) => {
    setSelected(s);
    setShowResults(false);
    setQuery('');
    setLoading(true);
    try {
      const [detail, hist] = await Promise.all([
        getSensor(s.id),
        getSensorHistory(s.id, range),
      ]);
      setSensorDetail(detail);
      setHistory(hist);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (r) => {
    setRange(r);
    if (!selected) return;
    try {
      const hist = await getSensorHistory(selected.id, r);
      setHistory(hist);
    } catch {}
  };

  const close = () => {
    setSelected(null);
    setSensorDetail(null);
    setHistory([]);
    setQuery('');
    setShowResults(false);
  };

  const openEditSensor = (sensor) => {
    setSensorModal({ open: true, data: sensor });
  };

  const handleDeleteSensor = async (sensor) => {
    if (deleteConfirmId !== sensor.id) {
      setDeleteConfirmId(sensor.id);
      return;
    }

    await deleteSensor(sensor.id);
    setDeleteConfirmId(null);
    if (selected?.id === sensor.id) {
      close();
    }
    onRefresh?.();
  };

  const chartData = history.map(h => ({
    time: new Date(h.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    value: parseFloat(h.value?.toFixed(2)),
  }));

  return (
    <>
      <div className="card flex flex-col">
        {/* Header + search bar - always visible */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="w-4 h-4 text-green-400" />
            <h2 className="text-sm font-semibold text-gray-100">Search Sensors</h2>
            <span className="ml-auto text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
              {sensors.length} total
            </span>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => { if (query.trim()) setShowResults(true); }}
              className="input-field pl-9 pr-8"
              placeholder="Type sensor ID, name or type..."
            />
            {query && (
              <button
                onClick={() => { setQuery(''); setShowResults(false); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Dropdown results - only when typing */}
        {showResults && (
          <div className="border-t border-gray-800 max-h-56 overflow-y-auto fade-in-up">
            {filtered.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-gray-600 text-sm">
                No sensors found for "{query}"
              </div>
            ) : filtered.map(s => {
              const sc = STATUS_CONFIG[s.status] || STATUS_CONFIG.inactive;
              return (
                <div key={s.id} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/60 transition-colors border-b border-gray-800/50 last:border-0 group">
                  <button
                    onClick={() => openSensor(s)}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left"
                  >
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sc.dot}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-mono font-medium text-gray-100">{s.id}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {s.type}
                        {s.villager_name && <span> · {s.villager_name}</span>}
                      </div>
                    </div>
                    <span className={sc.className}>{sc.label}</span>
                  </button>

                  {canWrite && (
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => openEditSensor(s)}
                        className="p-1 text-gray-500 hover:text-blue-400 rounded"
                        title="Edit sensor"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteSensor(s)}
                        className={`p-1 rounded ${deleteConfirmId === s.id ? 'text-red-400' : 'text-gray-500 hover:text-red-400'}`}
                        title={deleteConfirmId === s.id ? 'Click again to confirm delete' : 'Delete sensor'}
                      >
                        {deleteConfirmId === s.id
                          ? <Check className="w-3.5 h-3.5" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Selected sensor detail - expands below */}
        {selected && (
          <div className="border-t border-gray-800 fade-in-up">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
                <Loader className="w-4 h-4 animate-spin mr-2" /> Loading...
              </div>
            ) : sensorDetail && (
              <>
                {/* Detail header */}
                <div className="p-4 border-b border-gray-800">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-mono font-bold text-white">{sensorDetail.id}</div>
                      {sensorDetail.name && (
                        <div className="text-xs text-gray-400 mt-0.5">{sensorDetail.name}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={STATUS_CONFIG[sensorDetail.status]?.className || 'status-inactive'}>
                        {STATUS_CONFIG[sensorDetail.status]?.label}
                      </span>

                      {canWrite && (
                        <>
                          <button
                            onClick={() => openEditSensor(sensorDetail)}
                            className="p-1 text-gray-500 hover:text-blue-400 rounded"
                            title="Edit sensor"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteSensor(sensorDetail)}
                            className={`p-1 rounded ${deleteConfirmId === sensorDetail.id ? 'text-red-400' : 'text-gray-500 hover:text-red-400'}`}
                            title={deleteConfirmId === sensorDetail.id ? 'Click again to confirm delete' : 'Delete sensor'}
                          >
                            {deleteConfirmId === sensorDetail.id
                              ? <Check className="w-4 h-4" />
                              : <Trash2 className="w-4 h-4" />}
                          </button>
                        </>
                      )}

                      <button onClick={close} className="p-1 text-gray-500 hover:text-white rounded">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="bg-gray-800/60 rounded-lg px-3 py-2">
                      <div className="text-xs text-gray-500">Type</div>
                      <div className="text-sm font-medium text-gray-200">{sensorDetail.type}</div>
                    </div>
                    <div className="bg-gray-800/60 rounded-lg px-3 py-2">
                      <div className="text-xs text-gray-500">Latest Value</div>
                      <div className="text-sm font-bold text-green-400">
                        {sensorDetail.latestReading
                          ? `${sensorDetail.latestReading.value?.toFixed(2)}`
                          : <span className="text-gray-600 font-normal text-xs">No data yet</span>}
                      </div>
                    </div>
                  </div>

                  {sensorDetail.villager_name && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
                      <User className="w-3 h-3" /> {sensorDetail.villager_name}
                    </div>
                  )}
                  {sensorDetail.location_description && (
                    <div className="mt-1 flex items-start gap-1.5 text-xs text-gray-500">
                      <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      {sensorDetail.location_description}
                    </div>
                  )}
                </div>

                {/* History chart */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" /> History
                    </div>
                    <div className="flex gap-1">
                      {RANGE_OPTIONS.map(r => (
                        <button
                          key={r}
                          onClick={() => loadHistory(r)}
                          className={`text-xs px-2 py-0.5 rounded transition-colors ${
                            range === r
                              ? 'bg-green-800/60 text-green-300'
                              : 'text-gray-500 hover:text-gray-300'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  {chartData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-24 text-gray-700 text-sm">
                      <WifiOff className="w-5 h-5 mb-1" />
                      No data yet — run the simulator
                    </div>
                  ) : (
                    <div className="h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                          <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={35} />
                          <Tooltip
                            contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }}
                            labelStyle={{ color: '#9ca3af' }}
                            itemStyle={{ color: '#22c55e' }}
                          />
                          <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {sensorModal.open && (
        <SensorFormModal
          data={sensorModal.data}
          panchayatId={panchayatId}
          onClose={() => setSensorModal({ open: false, data: null })}
          onSaved={() => {
            setSensorModal({ open: false, data: null });
            onRefresh?.();
          }}
        />
      )}
    </>
  );
}
