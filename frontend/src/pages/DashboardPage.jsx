import React, { useState, useEffect, useCallback } from 'react';
import { ChevronRight, Leaf, AlertCircle, BarChart3 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePanchayat } from '../context/PanchayatContext';
import { getVillagers, getSensors, getDashboardStats, getAggregateReport } from '../api';
import Sidebar from '../components/dashboard/Sidebar';
import StatsBar from '../components/dashboard/StatsBar';
import VillagerSearch from '../components/dashboard/VillagerSearch';
import SensorSearch from '../components/dashboard/SensorSearch';
import AggregateReportPanel from '../components/dashboard/AggregateReportPanel';
import { useNavigate } from 'react-router-dom';
import { Map } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();
  const { selectedPanchayat, selectedDistrict, selectedBlock } = usePanchayat();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [villagers, setVillagers] = useState([]);
  const [sensors, setSensors] = useState([]);
  const [stats, setStats] = useState(null);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [aggregateReport, setAggregateReport] = useState(null);
  const [loadingAggregate, setLoadingAggregate] = useState(false);
  const [aggregateError, setAggregateError] = useState('');
  const [showAggregateReport, setShowAggregateReport] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    if (!selectedPanchayat?.id) {
      setVillagers([]);
      setSensors([]);
      setStats(null);
      return;
    }

    setLoadingData(true);
    setError('');
    try {
      const [vData, sData] = await Promise.all([
        getVillagers(selectedPanchayat.id),
        getSensors(selectedPanchayat.id),
      ]);
      setVillagers(vData);
      setSensors(sData);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load data');
    } finally {
      setLoadingData(false);
    }
  }, [selectedPanchayat?.id]);

  const navigate = useNavigate();

  const fetchStats = useCallback(async () => {
    if (!selectedPanchayat?.id) return;
    setLoadingStats(true);
    try {
      const data = await getDashboardStats(selectedPanchayat.id);
      setStats(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStats(false);
    }
  }, [selectedPanchayat?.id]);

  const fetchAggregateReport = useCallback(async () => {
    setLoadingAggregate(true);
    setAggregateError('');
    try {
      const data = await getAggregateReport();
      setAggregateReport(data);
    } catch (err) {
      setAggregateError(err.response?.data?.error || 'Failed to load aggregated report');
    } finally {
      setLoadingAggregate(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchStats();
  }, [fetchData, fetchStats]);

  // Auto-refresh stats every 30 seconds
  useEffect(() => {
    if (!selectedPanchayat) return;
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats, selectedPanchayat]);

  useEffect(() => {
    if (!showAggregateReport) return undefined;
    const interval = setInterval(fetchAggregateReport, 30000);
    return () => clearInterval(interval);
  }, [fetchAggregateReport, showAggregateReport]);

  const onRefresh = () => {
    fetchData();
    fetchStats();
    if (showAggregateReport) fetchAggregateReport();
  };

  const toggleAggregateReport = () => {
    const nextValue = !showAggregateReport;
    setShowAggregateReport(nextValue);
    if (nextValue && !aggregateReport && !loadingAggregate) {
      fetchAggregateReport();
    }
  };

  // Breadcrumb
  const breadcrumb = [
    { label: 'Kerala', active: false },
    selectedDistrict && { label: selectedDistrict.name, active: false },
    selectedBlock && { label: selectedBlock.name, active: false },
    selectedPanchayat && { label: selectedPanchayat.name, active: true },
  ].filter(Boolean);

  const sensorMapCard = (
    <button
      onClick={() => navigate('/map')}
      className="group min-h-64 w-full rounded-2xl border border-green-800/40 bg-gradient-to-br from-green-950/70 via-gray-900 to-gray-950 p-6 text-left transition-colors hover:border-green-600/60 hover:from-green-900/60 hover:to-gray-900"
    >
      <div className="flex h-full flex-col justify-between">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-green-500/80">Explore</div>
            <h2 className="mt-3 text-2xl font-bold text-white">Sensor Map</h2>
            <p className="mt-2 max-w-sm text-sm text-gray-400">
              View all sensors for your current access level on the live map.
            </p>
          </div>
          <div className="rounded-xl border border-green-700/50 bg-green-900/30 p-3 text-green-300 transition-colors group-hover:bg-green-900/50">
            <Map className="w-6 h-6" />
          </div>
        </div>

        <div className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-green-300">
          <Map className="w-4 h-4" />
          Open Sensor Map
        </div>
      </div>
    </button>
  );

  const aggregateReportButton = (
    <button
      onClick={toggleAggregateReport}
      className={`group min-h-64 w-full rounded-2xl border p-6 text-left transition-colors ${
        showAggregateReport
          ? 'border-blue-600/60 bg-gradient-to-br from-blue-950/70 via-gray-900 to-gray-950'
          : 'border-blue-800/40 bg-gradient-to-br from-blue-950/60 via-gray-900 to-gray-950 hover:border-blue-600/60 hover:from-blue-900/60 hover:to-gray-900'
      }`}
    >
      <div className="flex h-full flex-col justify-between">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400/80">Report</div>
            <h2 className="mt-3 text-2xl font-bold text-white">Aggregate Data</h2>
            <p className="mt-2 max-w-sm text-sm text-gray-400">
              {showAggregateReport
                ? 'Hide the aggregated averages report for this access level.'
                : 'Open the aggregated averages report for this access level.'}
            </p>
          </div>
          <div className="rounded-xl border border-blue-700/50 bg-blue-900/30 p-3 text-blue-300 transition-colors group-hover:bg-blue-900/50">
            <BarChart3 className="w-6 h-6" />
          </div>
        </div>

        <div className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-blue-300">
          <BarChart3 className="w-4 h-4" />
          {showAggregateReport ? 'Hide Aggregate Report' : 'Show Aggregate Report'}
        </div>
      </div>
    </button>
  );

  return (
    <div className="h-screen flex overflow-hidden bg-gray-950">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(c => !c)}
        villagers={villagers}
        sensors={sensors}
        onRefresh={onRefresh}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <header className="flex-shrink-0 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm px-6 py-3 flex items-center justify-between">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm">
            <Leaf className="w-4 h-4 text-green-500 flex-shrink-0" />
            {breadcrumb.length === 0 ? (
              <span className="text-gray-400">Select a location from the sidebar</span>
            ) : (
              breadcrumb.map((item, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-600" />}
                  <span className={item.active ? 'text-green-400 font-semibold' : 'text-gray-500'}>
                    {item.label}
                  </span>
                </React.Fragment>
              ))
            )}
          </div>

          {/* Right - role badge */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>{user?.full_name}</span>
            {!sidebarCollapsed ? null : (
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="flex items-center gap-1 text-green-400 hover:text-green-300"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4 fade-in-up">
            {showAggregateReport && (
              <AggregateReportPanel
                report={aggregateReport}
                loading={loadingAggregate}
                error={aggregateError}
              />
            )}

            {!selectedPanchayat ? (
              <>
                <div className="card p-6">
                  <div className="text-center max-w-sm mx-auto">
                    <div className="w-16 h-16 rounded-2xl bg-green-900/30 border border-green-800/40 flex items-center justify-center mx-auto mb-4">
                      <Leaf className="w-8 h-8 text-green-500" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-200 mb-2">Select a Panchayat</h2>
                    <p className="text-gray-500 text-sm">
                      {user?.role === 'panchayat'
                        ? 'Your panchayat data is loading...'
                        : 'Use the sidebar to navigate: select a district, block, and panchayat to view its detailed dashboard.'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                  {sensorMapCard}
                  {aggregateReportButton}
                </div>
              </>
            ) : (
              <>
              {/* Panchayat header */}
              <div>
                <h1 className="text-xl font-bold text-white">{selectedPanchayat.name}</h1>
                <p className="text-sm text-gray-500 mt-0.5">Panchayat Dashboard · Kerala</p>
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-900/20 border border-red-800/40 text-red-400 px-4 py-2.5 rounded-xl text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Stats Bar */}
              <StatsBar stats={stats} loading={loadingStats} panchayatName={selectedPanchayat.name} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                <div className="space-y-4">
                  <div className="h-96 md:h-auto">
                    <VillagerSearch
                      villagers={villagers}
                      panchayatId={selectedPanchayat.id}
                      onRefresh={onRefresh}
                    />
                  </div>
                </div>

                <div className="h-96 md:h-auto">
                  <SensorSearch
                    sensors={sensors}
                    panchayatId={selectedPanchayat.id}
                    onRefresh={onRefresh}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                {sensorMapCard}
                {aggregateReportButton}
              </div>

              {/* Hint for non-write users */}
              {user?.role !== 'panchayat' && (
                <div className="text-xs text-gray-600 text-center py-2 border border-gray-800/50 rounded-xl">
                  View-only mode — you are logged in as a <span className="text-gray-500 capitalize">{user?.role}-level</span> user
                </div>
              )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
