import React, { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Leaf, Palette } from 'lucide-react';

import Sidebar from '../components/dashboard/Sidebar';
import ThemeToggle from '../components/ThemeToggle';
import { getSensors, getVillagers } from '../api';
import { useAuth } from '../context/AuthContext';
import { usePanchayat } from '../context/PanchayatContext';
import usePersistentSidebar from '../hooks/usePersistentSidebar';

export default function SettingsPage() {
  const { user } = useAuth();
  const { selectedPanchayat, selectedDistrict, selectedBlock } = usePanchayat();

  const [sidebarCollapsed, setSidebarCollapsed] = usePersistentSidebar();
  const [villagers, setVillagers] = useState([]);
  const [sensors, setSensors] = useState([]);

  const fetchSidebarData = useCallback(async () => {
    if (!selectedPanchayat?.id) {
      setVillagers([]);
      setSensors([]);
      return;
    }

    try {
      const [villagerData, sensorData] = await Promise.all([
        getVillagers(selectedPanchayat.id),
        getSensors(selectedPanchayat.id),
      ]);
      setVillagers(villagerData);
      setSensors(sensorData);
    } catch {
      setVillagers([]);
      setSensors([]);
    }
  }, [selectedPanchayat?.id]);

  useEffect(() => {
    fetchSidebarData();
  }, [fetchSidebarData]);

  const breadcrumb = [
    { label: 'Kerala', active: false },
    selectedDistrict && { label: selectedDistrict.name, active: false },
    selectedBlock && { label: selectedBlock.name, active: false },
    selectedPanchayat && { label: selectedPanchayat.name, active: false },
    { label: 'Settings', active: true },
  ].filter(Boolean);

  return (
    <div className="h-screen flex overflow-hidden bg-gray-950">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((current) => !current)}
        villagers={villagers}
        sensors={sensors}
        onRefresh={fetchSidebarData}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="flex-shrink-0 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm">
            <Leaf className="w-4 h-4 text-green-500 flex-shrink-0" />
            {breadcrumb.map((item, index) => (
              <React.Fragment key={`${item.label}-${index}`}>
                {index > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-600" />}
                <span className={item.active ? 'text-green-400 font-semibold' : 'text-gray-500'}>
                  {item.label}
                </span>
              </React.Fragment>
            ))}
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>{user?.full_name}</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl space-y-6 fade-in-up">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-green-500/80">Preferences</div>
              <h1 className="mt-2 text-2xl font-bold text-white">Settings</h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-400">
                Manage interface preferences for your current session and device.
              </p>
            </div>

            <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6">
              <div>
                <div className="flex items-center gap-2 text-lg font-semibold text-white">
                  <Palette className="w-5 h-5 text-green-400" />
                  Theme
                </div>
                <p className="mt-2 text-sm text-gray-400">
                  Switch between dark mode and light mode. Your choice is saved in this browser.
                </p>
              </div>

              <div className="mt-5 rounded-xl border border-gray-800 bg-gray-950/60 p-4">
                <ThemeToggle />
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
