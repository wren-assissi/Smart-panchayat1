import React from 'react';
import { Cpu, Users, Activity, AlertTriangle, WifiOff } from 'lucide-react';

export default function StatsBar({ stats, panchayatName, loading }) {
  if (loading) {
    return (
      <div className="flex items-center gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-16 flex-1 bg-gray-800/50 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: 'Live Sensors',
      value: stats?.sensors?.active ?? '—',
      icon: <Activity className="w-5 h-5 text-green-400" />,
      color: 'border-green-800/40 bg-green-900/10',
      textColor: 'text-green-400',
      badge: stats?.sensors?.active > 0 && (
        <span className="flex items-center gap-1 text-xs text-green-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 live-pulse inline-block" />
          LIVE
        </span>
      ),
    },
    {
      label: 'Total Sensors',
      value: stats?.sensors?.total ?? '—',
      icon: <Cpu className="w-5 h-5 text-blue-400" />,
      color: 'border-blue-800/40 bg-blue-900/10',
      textColor: 'text-blue-400',
    },
    {
      label: 'Total Villagers',
      value: stats?.villagers ?? '—',
      icon: <Users className="w-5 h-5 text-purple-400" />,
      color: 'border-purple-800/40 bg-purple-900/10',
      textColor: 'text-purple-400',
    },
    {
      label: 'Faulty Sensors',
      value: stats?.sensors?.faulty ?? '—',
      icon: <AlertTriangle className="w-5 h-5 text-red-400" />,
      color: 'border-red-800/40 bg-red-900/10',
      textColor: 'text-red-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <div key={i} className={`rounded-xl border px-4 py-3 ${card.color}`}>
          <div className="flex items-center justify-between mb-1">
            {card.icon}
            {card.badge}
          </div>
          <div className={`text-2xl font-bold ${card.textColor}`}>{card.value}</div>
          <div className="text-xs text-gray-500 mt-0.5">{card.label}</div>
        </div>
      ))}
    </div>
  );
}
