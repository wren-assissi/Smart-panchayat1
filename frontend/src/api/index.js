import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// Attach token from localStorage to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Villagers
export const getVillagers = (panchayatId, search = '') =>
  api.get('/villagers', { params: { panchayatId, search } }).then(r => r.data);

export const getVillager = (id) =>
  api.get(`/villagers/${id}`).then(r => r.data);

export const createVillager = (data) =>
  api.post('/villagers', data).then(r => r.data);

export const updateVillager = (id, data) =>
  api.put(`/villagers/${id}`, data).then(r => r.data);

export const deleteVillager = (id) =>
  api.delete(`/villagers/${id}`).then(r => r.data);

// Sensors
export const getSensors = (panchayatId, search = '', type = '') =>
  api.get('/sensors', { params: { panchayatId, search, type } }).then(r => r.data);

export const getSensor = (id) =>
  api.get(`/sensors/${id}`).then(r => r.data);

export const getSensorHistory = (id, range = '24h') =>
  api.get(`/sensors/${id}/history`, { params: { range } }).then(r => r.data);

export const createSensor = (data) =>
  api.post('/sensors', data).then(r => r.data);

export const updateSensor = (id, data) =>
  api.put(`/sensors/${id}`, data).then(r => r.data);

export const deleteSensor = (id) =>
  api.delete(`/sensors/${id}`).then(r => r.data);

export const getDashboardStats = (panchayatId) =>
  api.get(`/sensors/stats/${panchayatId}`).then(r => r.data);

export const getAggregateReport = () =>
  api.get('/sensors/aggregate/report').then(r => r.data);

export const searchVillagersByPhone = (panchayatId, q) =>
  api.get('/villagers/search/phone', { params: { panchayatId, q } }).then(r => r.data);

// Locations
export const getDistricts = () =>
  api.get('/locations/districts').then(r => r.data);

export const getBlocks = (districtId) =>
  api.get(`/locations/blocks/${districtId}`).then(r => r.data);

export const getPanchayats = (blockId) =>
  api.get(`/locations/panchayats/${blockId}`).then(r => r.data);


export const getMapSensors = (type) =>
  api.get('/sensors/map/pins', { params: { type } }).then(r => r.data);

export const getMapReadings = (sensors) =>
  api.post('/sensors/map/readings', { sensors }).then(r => r.data);

export default api;
