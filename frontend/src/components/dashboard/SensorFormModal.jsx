import React, { useState, useEffect, useRef } from 'react';
import { X, Cpu, Phone, MapPin } from 'lucide-react';
import { createSensor, updateSensor, searchVillagersByPhone } from '../../api';
import { usePanchayat } from '../../context/PanchayatContext';

const SENSOR_TYPES = ['Temp', 'WaterPH', 'WaterSalinity', 'SoilMoisture', 'SoilPH', 'AirQuality'];
const SENSOR_STATUSES = ['active', 'inactive', 'faulty'];

export default function SensorFormModal({ data, panchayatId, districtId: districtIdProp, onClose, onSaved }) {
  const isEdit = !!data;
  const { selectedDistrict, districtId: districtIdCtx } = usePanchayat();

  // Resolve districtId from prop (passed by Sidebar) or context fallback
  const resolvedDistrictId = districtIdProp || districtIdCtx || selectedDistrict?.id || '';

  const [form, setForm] = useState({
    id: data?.id || '',
    name: data?.name || '',
    type: data?.type || 'Temp',
    status: data?.status || 'active',
    location_description: data?.location_description || '',
    latitude: data?.latitude || '',
    longitude: data?.longitude || '',
    villager_id: data?.villager_id || '',
    district_id: data?.district_id || resolvedDistrictId,
  });

  // Villager phone search state
  const [phoneQuery, setPhoneQuery] = useState(data?.villager_phone || '');
  const [villagerResults, setVillagerResults] = useState([]);
  const [selectedVillager, setSelectedVillager] = useState(
    data?.villager_id ? { id: data.villager_id, name: data.villager_name, phone: data.villager_phone } : null
  );
  const [showVillagerDropdown, setShowVillagerDropdown] = useState(false);
  const phoneSearchRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sync district_id if context resolves after mount
  useEffect(() => {
    if (!form.district_id && resolvedDistrictId) {
      setForm(f => ({ ...f, district_id: resolvedDistrictId }));
    }
  }, [resolvedDistrictId]);

  // Phone search with debounce
  useEffect(() => {
    if (!phoneQuery.trim() || phoneQuery.length < 3) {
      setVillagerResults([]);
      setShowVillagerDropdown(false);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const results = await searchVillagersByPhone(panchayatId, phoneQuery);
        setVillagerResults(results);
        setShowVillagerDropdown(true);
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [phoneQuery, panchayatId]);

  const selectVillager = (v) => {
    setSelectedVillager(v);
    setForm(f => ({ ...f, villager_id: v.id }));
    setPhoneQuery(v.phone || '');
    setShowVillagerDropdown(false);
    setVillagerResults([]);
  };

  const clearVillager = () => {
    setSelectedVillager(null);
    setForm(f => ({ ...f, villager_id: '' }));
    setPhoneQuery('');
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (phoneSearchRef.current && !phoneSearchRef.current.contains(e.target)) {
        setShowVillagerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.id.trim()) return setError('Sensor ID is required');
    if (!form.district_id) return setError('District could not be resolved. Please try again.');
    if (form.latitude === '' || form.longitude === '') return setError('Latitude and longitude are required');

    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);

    if (isNaN(lat) || lat < -90 || lat > 90) return setError('Latitude must be between -90 and 90');
    if (isNaN(lng) || lng < -180 || lng > 180) return setError('Longitude must be between -180 and 180');

    setLoading(true);
    setError('');
    try {
      const payload = {
        ...form,
        latitude: lat,
        longitude: lng,
        villager_id: form.villager_id || null,
        panchayat_id: panchayatId,
      };
      if (isEdit) {
        await updateSensor(data.id, payload);
      } else {
        await createSensor(payload);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save sensor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto fade-in-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 sticky top-0 bg-gray-900">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-green-400" />
            {isEdit ? 'Edit Sensor' : 'Add Sensor'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-800/50 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Sensor ID */}
          <div>
            <label className="label">Sensor ID * <span className="text-gray-600">(unique identifier)</span></label>
            <input
              type="text"
              value={form.id}
              onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
              className="input-field font-mono"
              placeholder="e.g., MALA_TEMP_004"
              required
              disabled={isEdit}
            />
          </div>

          {/* Display Name */}
          <div>
            <label className="label">Display Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="input-field"
              placeholder="e.g., Field Temperature Sensor"
            />
          </div>

          {/* Type + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Sensor Type *</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="input-field"
                required
              >
                {SENSOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="input-field"
              >
                {SENSOR_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* District - auto filled, read only */}
          <div>
            <label className="label">District <span className="text-gray-600">(auto-filled)</span></label>
            <input
              type="text"
              value={selectedDistrict?.name || data?.district_name || ''}
              className="input-field opacity-60 cursor-not-allowed"
              readOnly
              disabled
              placeholder="Auto-selected from panchayat"
            />
          </div>

          {/* Villager phone search */}
          <div>
            <label className="label">
              Assign to Villager
              <span className="text-gray-600 font-normal ml-1">(search by mobile — leave empty for common sensor)</span>
            </label>

            {selectedVillager ? (
              <div className="flex items-center gap-3 bg-purple-900/20 border border-purple-700/40 rounded-lg px-3 py-2.5">
                <div className="w-7 h-7 rounded-full bg-purple-900/50 flex items-center justify-center text-purple-300 font-bold text-xs flex-shrink-0">
                  {selectedVillager.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-100">{selectedVillager.name}</div>
                  <div className="text-xs text-gray-400 flex items-center gap-1">
                    <Phone className="w-3 h-3" />{selectedVillager.phone}
                  </div>
                </div>
                <button type="button" onClick={clearVillager} className="text-gray-500 hover:text-red-400 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative" ref={phoneSearchRef}>
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="tel"
                  value={phoneQuery}
                  onChange={e => setPhoneQuery(e.target.value)}
                  className="input-field pl-9"
                  placeholder="Type mobile number to search..."
                />
                {showVillagerDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden fade-in-up">
                    {villagerResults.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-500">No villagers found for "{phoneQuery}"</div>
                    ) : villagerResults.map(v => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => selectVillager(v)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700 transition-colors text-left border-b border-gray-700/50 last:border-0"
                      >
                        <div className="w-7 h-7 rounded-full bg-purple-900/50 flex items-center justify-center text-purple-300 font-bold text-xs flex-shrink-0">
                          {v.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-100">{v.name}</div>
                          <div className="text-xs text-gray-400 flex items-center gap-1">
                            <Phone className="w-3 h-3" />{v.phone}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Location description */}
          <div>
            <label className="label">Location Description</label>
            <textarea
              value={form.location_description}
              onChange={e => setForm(f => ({ ...f, location_description: e.target.value }))}
              className="input-field resize-none"
              placeholder="e.g., North paddy field, near irrigation channel"
              rows={2}
            />
          </div>

          {/* Lat / Lng */}
          <div>
            <label className="label flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-green-500" />
              GPS Coordinates *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <input
                  type="number"
                  step="any"
                  value={form.latitude}
                  onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))}
                  className="input-field font-mono"
                  placeholder="Latitude e.g. 10.4820"
                  required
                />
              </div>
              <div>
                <input
                  type="number"
                  step="any"
                  value={form.longitude}
                  onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))}
                  className="input-field font-mono"
                  placeholder="Longitude e.g. 76.2673"
                  required
                />
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              Tip: Open Google Maps, right-click your location and copy the coordinates.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-60">
              {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {isEdit ? 'Update Sensor' : 'Add Sensor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
