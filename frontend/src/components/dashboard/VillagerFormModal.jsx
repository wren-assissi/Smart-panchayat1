import React, { useState } from 'react';
import { X, User, Phone, MapPin } from 'lucide-react';
import { createVillager, updateVillager } from '../../api';

export default function VillagerFormModal({ data, panchayatId, onClose, onSaved }) {
  const isEdit = !!data;
  const [form, setForm] = useState({
    name: data?.name || '',
    phone: data?.phone || '',
    address: data?.address || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('Name is required');
    setLoading(true);
    setError('');
    try {
      if (isEdit) {
        await updateVillager(data.id, form);
      } else {
        await createVillager({ ...form, panchayat_id: panchayatId });
      }
      onSaved();
    } catch (err) {
      if (err.response?.data?.error?.includes('unique_phone') || 
          err.response?.data?.error?.includes('Duplicate entry')) {
        setError('This phone number is already registered to another villager');
      } else {
        setError(err.response?.data?.error || 'Failed to save villager');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md fade-in-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <User className="w-4 h-4 text-green-400" />
            {isEdit ? 'Edit Villager' : 'Add Villager'}
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

          <div>
            <label className="label">Full Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="input-field"
              placeholder="e.g., Rajan Pillai"
              required
              autoFocus
            />
          </div>

          <div>
              <label className="label">Phone Number <span className="text-gray-600">(must be unique)</span></label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="input-field"
                placeholder="e.g., 9876543210"
                pattern="[0-9]{10}"
                title="Enter a valid 10-digit mobile number"
              />
          </div>

          <div>
            <label className="label">Address</label>
            <textarea
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              className="input-field resize-none"
              placeholder="Plot address or description..."
              rows={3}
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-60">
              {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              {isEdit ? 'Update' : 'Add Villager'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
