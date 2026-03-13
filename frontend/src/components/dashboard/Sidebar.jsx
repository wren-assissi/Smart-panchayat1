import React, { useState } from 'react';
import {
  ChevronRight, ChevronDown, Users, Cpu,
  Plus, Edit2, Trash2, LogOut, Leaf,
  ChevronLeft, MapPin, Building2, Home,
  X, Check, AlertTriangle, BarChart3
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePanchayat } from '../../context/PanchayatContext';
import VillagerFormModal from './VillagerFormModal';
import SensorFormModal from './SensorFormModal';
import { useLocation, useNavigate } from 'react-router-dom';

export default function Sidebar({
  collapsed, onToggle,
  villagers, sensors, onRefresh
}) {
  const { user, logout, canWrite } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedPanchayat, selectedBlock, selectedDistrict,
    districts, blocks, panchayats,
    selectDistrict, selectBlock, selectPanchayat } = usePanchayat();

  const [villagerOpen, setVillagerOpen] = useState(true);
  const [sensorOpen, setSensorOpen] = useState(true);
  const [locationOpen, setLocationOpen] = useState(true);

  const [villagerModal, setVillagerModal] = useState({ open: false, data: null });
  const [sensorModal, setSensorModal] = useState({ open: false, data: null });
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const handleDeleteVillager = async (v) => {
    if (deleteConfirm?.id === v.id && deleteConfirm.type === 'villager') {
      const { deleteVillager } = await import('../../api');
      await deleteVillager(v.id);
      setDeleteConfirm(null);
      onRefresh();
    } else {
      setDeleteConfirm({ id: v.id, type: 'villager' });
    }
  };

  const handleDeleteSensor = async (s) => {
    if (deleteConfirm?.id === s.id && deleteConfirm.type === 'sensor') {
      const { deleteSensor } = await import('../../api');
      await deleteSensor(s.id);
      setDeleteConfirm(null);
      onRefresh();
    } else {
      setDeleteConfirm({ id: s.id, type: 'sensor' });
    }
  };

  const roleBadgeColor = {
    state: 'bg-purple-900/50 text-purple-400 border-purple-700/50',
    district: 'bg-blue-900/50 text-blue-400 border-blue-700/50',
    block: 'bg-yellow-900/50 text-yellow-400 border-yellow-700/50',
    panchayat: 'bg-green-900/50 text-green-400 border-green-700/50',
  };

  if (collapsed) {
    return (
      <aside className="h-full flex flex-col bg-gray-900 border-r border-gray-800 w-14 sidebar-transition">
        <div className="p-3 border-b border-gray-800 flex items-center justify-center">
          <Leaf className="w-6 h-6 text-green-400" />
        </div>
        <div className="flex-1 flex flex-col items-center py-4 gap-4">
          <button onClick={() => navigate('/analytics')} className={`p-2 rounded-lg ${location.pathname === '/analytics' ? 'text-green-300 bg-green-900/30' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`} title="Analytics"><BarChart3 className="w-5 h-5" /></button>
          <button onClick={() => { onToggle(); setLocationOpen(true); }} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800" title="Locations"><MapPin className="w-5 h-5" /></button>
          {canWrite && <>
            <button onClick={() => { onToggle(); setVillagerOpen(true); }} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800" title="Villagers"><Users className="w-5 h-5" /></button>
            <button onClick={() => { onToggle(); setSensorOpen(true); }} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800" title="Sensors"><Cpu className="w-5 h-5" /></button>
          </>}
        </div>
        <div className="p-3 border-t border-gray-800 flex justify-center">
          <button onClick={logout} className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800" title="Logout">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <>
      <aside className="h-full flex flex-col bg-gray-900 border-r border-gray-800 w-72 sidebar-transition overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-green-900/60 flex items-center justify-center">
              <Leaf className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Smart Panchayat</div>
              <div className="text-xs text-gray-500">Kerala IoT System</div>
            </div>
          </div>
          <button onClick={onToggle} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800">
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* User info */}
        <div className="px-4 py-3 border-b border-gray-800 flex-shrink-0">
          <div className="text-sm font-medium text-gray-100">{user?.full_name}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${roleBadgeColor[user?.role]}`}>
              {user?.role?.toUpperCase()}
            </span>
            {user?.location_name && (
              <span className="text-xs text-gray-500 truncate">{user.location_name}</span>
            )}
          </div>
        </div>

        {/* Location Selector */}
        <div className="flex-shrink-0">
          <div className="px-4 py-3 border-b border-gray-800 bg-gray-950/40">
            <button
              onClick={() => navigate('/analytics')}
              className={`w-full flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                location.pathname === '/analytics'
                  ? 'border-green-700/50 bg-green-900/20 text-green-300'
                  : 'border-gray-800 bg-gray-900/40 text-gray-300 hover:border-gray-700 hover:bg-gray-800/70 hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Threshold Analytics
            </button>
          </div>
          <button
            onClick={() => setLocationOpen(!locationOpen)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-400 hover:text-gray-200 uppercase tracking-wider border-b border-gray-800"
          >
            <span className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" /> Location</span>
            {locationOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          {locationOpen && (
            <div className="px-4 py-3 space-y-3 border-b border-gray-800 bg-gray-950/50">
              {/* District */}
              {user?.role === 'state' && (
                <div>
                  <label className="label flex items-center gap-1.5"><Building2 className="w-3 h-3" /> District</label>
                  <select
                    value={selectedDistrict?.id || ''}
                    onChange={e => {
                      const d = districts.find(d => d.id === parseInt(e.target.value));
                      selectDistrict(d || null);
                    }}
                    className="input-field text-xs"
                  >
                    <option value="">Select District</option>
                    {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}

              {/* Block */}
              {['state', 'district'].includes(user?.role) && (
                <div>
                  <label className="label flex items-center gap-1.5"><MapPin className="w-3 h-3" /> Block</label>
                  <select
                    value={selectedBlock?.id || ''}
                    onChange={e => {
                      const b = blocks.find(b => b.id === parseInt(e.target.value));
                      selectBlock(b || null);
                    }}
                    className="input-field text-xs"
                    disabled={!selectedDistrict}
                  >
                    <option value="">{selectedDistrict ? 'Select Block' : '-- Select district first --'}</option>
                    {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}

              {/* Panchayat */}
              {['state', 'district', 'block'].includes(user?.role) && (
                <div>
                  <label className="label flex items-center gap-1.5"><Home className="w-3 h-3" /> Panchayat</label>
                  <select
                    value={selectedPanchayat?.id || ''}
                    onChange={e => {
                      const p = panchayats.find(p => p.id === parseInt(e.target.value));
                      selectPanchayat(p || null);
                    }}
                    className="input-field text-xs"
                    disabled={!selectedBlock}
                  >
                    <option value="">{selectedBlock ? 'Select Panchayat' : '-- Select block first --'}</option>
                    {panchayats.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}

              {user?.role === 'panchayat' && (
                <div className="flex items-center gap-2 py-1">
                  <Home className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-sm text-green-300 font-medium">{user.location_name}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Management sections - only for panchayat role */}
        {canWrite && selectedPanchayat && (
          <>
            {/* Villagers Section */}
            <div className="flex-shrink-0">
              <button
                onClick={() => setVillagerOpen(!villagerOpen)}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-400 hover:text-gray-200 uppercase tracking-wider border-b border-gray-800"
              >
                <span className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" /> Villagers
                  <span className="ml-1 text-xs bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded-full font-normal normal-case">
                    {villagers.length}
                  </span>
                </span>
                {villagerOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              {villagerOpen && (
                <div className="border-b border-gray-800">
                  <div className="px-4 py-2">
                    <button
                      onClick={() => setVillagerModal({ open: true, data: null })}
                      className="w-full flex items-center justify-center gap-1.5 text-xs text-green-400 hover:text-green-300 bg-green-900/20 hover:bg-green-900/40 border border-green-800/40 rounded-lg py-2 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Villager
                    </button>
                  </div>

                  <div className="max-h-48 overflow-y-auto">
                    {villagers.length === 0 ? (
                      <p className="text-center text-xs text-gray-600 py-3">No villagers yet</p>
                    ) : villagers.map(v => (
                      <div key={v.id} className="flex items-center justify-between px-4 py-2 hover:bg-gray-800/50 group">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-gray-200 truncate">{v.name}</div>
                          <div className="text-xs text-gray-500">{v.sensor_count || 0} sensors</div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0">
                          <button
                            onClick={() => setVillagerModal({ open: true, data: v })}
                            className="p-1 text-gray-500 hover:text-blue-400 rounded"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteVillager(v)}
                            className={`p-1 rounded ${deleteConfirm?.id === v.id && deleteConfirm.type === 'villager' ? 'text-red-400' : 'text-gray-500 hover:text-red-400'}`}
                          >
                            {deleteConfirm?.id === v.id && deleteConfirm.type === 'villager'
                              ? <Check className="w-3 h-3" />
                              : <Trash2 className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sensors Section */}
            <div className="flex-shrink-0">
              <button
                onClick={() => setSensorOpen(!sensorOpen)}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-400 hover:text-gray-200 uppercase tracking-wider border-b border-gray-800"
              >
                <span className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5" /> Sensors
                  <span className="ml-1 text-xs bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded-full font-normal normal-case">
                    {sensors.length}
                  </span>
                </span>
                {sensorOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              {sensorOpen && (
                <div className="border-b border-gray-800">
                  <div className="px-4 py-2">
                    <button
                      onClick={() => setSensorModal({ open: true, data: null })}
                      className="w-full flex items-center justify-center gap-1.5 text-xs text-green-400 hover:text-green-300 bg-green-900/20 hover:bg-green-900/40 border border-green-800/40 rounded-lg py-2 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Sensor
                    </button>
                  </div>

                  <div className="max-h-48 overflow-y-auto">
                    {sensors.length === 0 ? (
                      <p className="text-center text-xs text-gray-600 py-3">No sensors yet</p>
                    ) : sensors.map(s => (
                      <div key={s.id} className="flex items-center justify-between px-4 py-2 hover:bg-gray-800/50 group">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-gray-200 font-mono">{s.id}</div>
                          <div className="text-xs text-gray-500">{s.type} · <span className={`${s.status === 'active' ? 'text-green-400' : s.status === 'faulty' ? 'text-red-400' : 'text-gray-500'}`}>{s.status}</span></div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0">
                          <button
                            onClick={() => setSensorModal({ open: true, data: s })}
                            className="p-1 text-gray-500 hover:text-blue-400 rounded"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteSensor(s)}
                            className={`p-1 rounded ${deleteConfirm?.id === s.id && deleteConfirm.type === 'sensor' ? 'text-red-400' : 'text-gray-500 hover:text-red-400'}`}
                          >
                            {deleteConfirm?.id === s.id && deleteConfirm.type === 'sensor'
                              ? <Check className="w-3 h-3" />
                              : <Trash2 className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 flex-shrink-0">
          <button
            onClick={logout}
            className="w-full flex items-center gap-2.5 text-sm text-gray-400 hover:text-red-400 transition-colors py-2 px-3 rounded-lg hover:bg-red-900/10"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Modals */}
      {villagerModal.open && (
        <VillagerFormModal
          data={villagerModal.data}
          panchayatId={selectedPanchayat?.id}
          onClose={() => setVillagerModal({ open: false, data: null })}
          onSaved={() => { setVillagerModal({ open: false, data: null }); onRefresh(); }}
        />
      )}
      {sensorModal.open && (
        <SensorFormModal
          data={sensorModal.data}
          panchayatId={selectedPanchayat?.id}
          villagers={villagers}
          onClose={() => setSensorModal({ open: false, data: null })}
          onSaved={() => { setSensorModal({ open: false, data: null }); onRefresh(); }}
        />
      )}
    </>
  );
}
