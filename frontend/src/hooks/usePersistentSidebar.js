import { useEffect, useState } from 'react';

const SIDEBAR_STORAGE_KEY = 'smart-panchayat-sidebar-collapsed';

function getInitialSidebarState() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
}

export default function usePersistentSidebar() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarState);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  return [sidebarCollapsed, setSidebarCollapsed];
}
