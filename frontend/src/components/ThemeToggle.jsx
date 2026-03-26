import React from 'react';
import { Moon, Sun } from 'lucide-react';

import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle() {
  const { theme, isLight, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="theme-toggle"
      aria-label={`Switch to ${isLight ? 'dark' : 'light'} mode`}
      title={`Switch to ${isLight ? 'dark' : 'light'} mode`}
    >
      <span className="theme-toggle__icon">
        {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      </span>
      <span className="theme-toggle__text">{theme === 'dark' ? 'Dark' : 'Light'} mode</span>
    </button>
  );
}
