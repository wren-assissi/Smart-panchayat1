import React, { useState, useEffect } from 'react';
import { Search, User, Cpu, Phone, MapPin, ChevronRight, X, Loader, Edit2, Trash2, Check } from 'lucide-react';
import { getVillager, deleteVillager } from '../../api';
import { useAuth } from '../../context/AuthContext';
import VillagerFormModal from './VillagerFormModal';

export default function VillagerSearch({ villagers, panchayatId, onRefresh }) {
  const { canWrite } = useAuth();
  const [query, setQuery] = useState('');
  const [filtered, setFiltered] = useState([]);
  const [selected, setSelected] = useState(null);
  const [sensors, setSensors] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [villagerModal, setVillagerModal] = useState({ open: false, data: null });

  useEffect(() => {
    if (!query.trim()) {
      setFiltered([]);
      setShowResults(false);
    } else {
      setFiltered(villagers.filter(v =>
        v.name.toLowerCase().includes(query.toLowerCase())
      ));
      setShowResults(true);
    }
  }, [query, villagers]);

  const openVillager = async (v) => {
    setSelected(v);
    setShowResults(false);
    setQuery('');
    setLoadingDetail(true);
    try {
      const detail = await getVillager(v.id);
      setSensors(detail.sensors || []);
    } catch {
      setSensors([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  const close = () => {
    setSelected(null);
    setSensors([]);
    setQuery('');
    setShowResults(false);
  };

  const openEditVillager = (villager) => {
    setVillagerModal({ open: true, data: villager });
  };

  const handleDeleteVillager = async (villager) => {
    if (deleteConfirmId !== villager.id) {
      setDeleteConfirmId(villager.id);
      return;
    }

    await deleteVillager(villager.id);
    setDeleteConfirmId(null);
    if (selected?.id === villager.id) {
      close();
    }
    onRefresh?.();
  };

  return (
    <>
      <div className="card flex flex-col">
        {/* Header + search bar - always visible */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-purple-400" />
            <h2 className="text-sm font-semibold text-gray-100">Search Villagers</h2>
            <span className="ml-auto text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
              {villagers.length} total
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
              placeholder="Type a name to search..."
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
                No villagers found for "{query}"
              </div>
            ) : filtered.map(v => (
              <div key={v.id} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/60 transition-colors border-b border-gray-800/50 last:border-0 group">
                <button
                  onClick={() => openVillager(v)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-purple-900/50 border border-purple-700/40 flex items-center justify-center flex-shrink-0 text-purple-300 font-bold text-xs">
                    {v.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-100">{v.name}</div>
                    <div className="text-xs text-gray-500">
                      <Cpu className="w-3 h-3 inline mr-1" />{v.sensor_count || 0} sensors
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 flex-shrink-0" />
                </button>

                {canWrite && (
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => openEditVillager(v)}
                      className="p-1 text-gray-500 hover:text-blue-400 rounded"
                      title="Edit villager"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteVillager(v)}
                      className={`p-1 rounded ${deleteConfirmId === v.id ? 'text-red-400' : 'text-gray-500 hover:text-red-400'}`}
                      title={deleteConfirmId === v.id ? 'Click again to confirm delete' : 'Delete villager'}
                    >
                      {deleteConfirmId === v.id
                        ? <Check className="w-3.5 h-3.5" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Selected villager detail - expands below search bar */}
        {selected && (
          <div className="border-t border-gray-800 fade-in-up">
            <div className="p-4 border-b border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-purple-900/50 border border-purple-700/40 flex items-center justify-center text-purple-300 font-bold">
                  {selected.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white">{selected.name}</div>
                  {selected.phone && (
                    <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3" />{selected.phone}
                    </div>
                  )}
                </div>

                {canWrite && (
                  <div className="flex items-center gap-1.5 mr-1">
                    <button
                      onClick={() => openEditVillager(selected)}
                      className="p-1 text-gray-500 hover:text-blue-400 rounded"
                      title="Edit villager"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteVillager(selected)}
                      className={`p-1 rounded ${deleteConfirmId === selected.id ? 'text-red-400' : 'text-gray-500 hover:text-red-400'}`}
                      title={deleteConfirmId === selected.id ? 'Click again to confirm delete' : 'Delete villager'}
                    >
                      {deleteConfirmId === selected.id
                        ? <Check className="w-3.5 h-3.5" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}

                <button onClick={close} className="p-1 text-gray-500 hover:text-white rounded flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {selected.address && (
                <div className="mt-2 flex items-start gap-1.5 text-xs text-gray-500 pl-12">
                  <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>{selected.address}</span>
                </div>
              )}
            </div>

            <div className="p-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" /> Sensors ({sensors.length})
              </div>

              {loadingDetail ? (
                <div className="flex items-center justify-center py-4 text-gray-500 text-sm">
                  <Loader className="w-4 h-4 animate-spin mr-2" /> Loading...
                </div>
              ) : sensors.length === 0 ? (
                <p className="text-xs text-gray-600 text-center py-3">No sensors assigned</p>
              ) : (
                <div className="space-y-2">
                  {sensors.map(s => (
                    <div key={s.id} className="flex items-center gap-3 bg-gray-800/60 rounded-lg px-3 py-2.5">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{
                        backgroundColor: s.status === 'active' ? '#22c55e' : s.status === 'faulty' ? '#ef4444' : '#6b7280'
                      }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-mono font-medium text-gray-200">{s.id}</div>
                        <div className="text-xs text-gray-500">{s.name || s.type}</div>
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        s.status === 'active' ? 'text-green-400 bg-green-900/30' :
                        s.status === 'faulty' ? 'text-red-400 bg-red-900/30' :
                        'text-gray-400 bg-gray-800'}`}>
                        {s.type}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {villagerModal.open && (
        <VillagerFormModal
          data={villagerModal.data}
          panchayatId={panchayatId}
          onClose={() => setVillagerModal({ open: false, data: null })}
          onSaved={() => {
            setVillagerModal({ open: false, data: null });
            onRefresh?.();
          }}
        />
      )}
    </>
  );
}
