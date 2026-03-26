import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const THEME_STORAGE_KEY = 'smart-panchayat-theme';
const ThemeContext = createContext(null);

function getInitialTheme() {
  if (typeof window === 'undefined') return 'dark';

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle('light', theme === 'light');
    root.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo(() => ({
    theme,
    isLight: theme === 'light',
    toggleTheme: () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return context;
}
