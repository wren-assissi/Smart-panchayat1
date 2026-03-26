import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BarChart3, Search, X } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getBlocks, getDistricts, getPanchayats, getTrendAnalysis } from '../../api';
import { useAuth } from '../../context/AuthContext';

const SERIES_COLORS = ['#22c55e', '#38bdf8', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6'];
const MONITOR_PRESETS = [
  { label: '90 Days', value: 90, unit: 'day' },
  { label: '6 Months', value: 6, unit: 'month' },
  { label: '1 Year', value: 1, unit: 'year' },
];
const BUCKET_LABELS = {
  hour: 'Hours',
  day: 'Days',
  week: 'Weeks',
  month: 'Months',
  year: 'Years',
};

function formatLevel(level) {
  return level ? `${level.charAt(0).toUpperCase()}${level.slice(1)}` : '';
}

function formatValue(value) {
  if (value == null) return 'No data';
  return Number(value).toFixed(2);
}

function formatDateRange(start, end) {
  if (!start || !end) return '';

  const startDate = new Date(start);
  const endDate = new Date(end);

  return `${startDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} to ${endDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function formatExclusiveDateRange(start, end) {
  if (!start || !end) return '';
  return formatDateRange(start, new Date(new Date(end).getTime() - 1));
}

function getTodayDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function getDateDaysAgo(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function getComparisonLevelOptions(role) {
  if (role === 'state') {
    return [
      { id: 'district', name: 'Districts' },
      { id: 'block', name: 'Blocks' },
      { id: 'panchayat', name: 'Panchayats' },
    ];
  }

  if (role === 'district') {
    return [
      { id: 'block', name: 'Blocks' },
      { id: 'panchayat', name: 'Panchayats' },
    ];
  }

  if (role === 'block') {
    return [{ id: 'panchayat', name: 'Panchayats' }];
  }

  return [];
}

function getDefaultComparisonLevel(role) {
  return getComparisonLevelOptions(role)[0]?.id || '';
}

function formatBucketRange(bucketStart, bucketUnit, rangeStart, rangeEnd) {
  if (!bucketStart) return '';

  const actualStart = rangeStart ? new Date(rangeStart) : null;
  const actualEnd = rangeEnd ? new Date(rangeEnd) : null;
  const start = new Date(bucketStart);
  const end = new Date(start);

  if (bucketUnit === 'hour') {
    end.setHours(end.getHours() + 1);
    end.setMilliseconds(end.getMilliseconds() - 1);
  } else if (bucketUnit === 'day') {
    end.setHours(23, 59, 59, 999);
  } else if (bucketUnit === 'week') {
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (bucketUnit === 'month') {
    end.setMonth(end.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  } else {
    end.setMonth(11, 31);
    end.setHours(23, 59, 59, 999);
  }

  const clampedStart = actualStart && start < actualStart ? actualStart : start;
  const clampedEnd = actualEnd && end > actualEnd ? actualEnd : end;

  if (bucketUnit === 'hour') {
    return `${clampedStart.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric' })} to ${clampedEnd.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric' })}`;
  }

  if (clampedStart.toDateString() === clampedEnd.toDateString()) {
    return clampedStart.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return `${clampedStart.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} to ${clampedEnd.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function formatChartTick(value) {
  return value;
}

function getAvailableBucketUnits(durationValue, durationUnit) {
  if (durationUnit === 'day') {
    if (durationValue <= 7) return ['hour', 'day'];
    if (durationValue <= 90) return ['day', 'week'];
    return ['week', 'month'];
  }

  if (durationUnit === 'week') {
    if (durationValue <= 1) return ['hour', 'day'];
    if (durationValue <= 8) return ['day', 'week'];
    if (durationValue >= 52) return ['month', 'year'];
    return ['week', 'month'];
  }

  if (durationUnit === 'month') {
    if (durationValue <= 1) return ['day', 'week'];
    if (durationValue < 24) return ['week', 'month'];
    return ['month', 'year'];
  }

  if (durationValue === 1) return ['week', 'month'];
  if (durationValue <= 3) return ['month', 'year'];
  return ['year'];
}

function buildScopeParams(user, districtId, blockId, panchayatId) {
  if (user?.role === 'panchayat') {
    return { panchayatId: user.location_id };
  }

  if (user?.role === 'block') {
    return panchayatId
      ? { blockId: user.location_id, panchayatId }
      : { blockId: user.location_id };
  }

  if (user?.role === 'district') {
    return {
      districtId: user.location_id,
      ...(blockId ? { blockId } : {}),
      ...(panchayatId ? { panchayatId } : {}),
    };
  }

  return {
    ...(districtId ? { districtId } : {}),
    ...(blockId ? { blockId } : {}),
    ...(panchayatId ? { panchayatId } : {}),
  };
}

function SelectField({ label, value, onChange, options, placeholder, disabled = false }) {
  return (
    <label className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{label}</div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none transition-colors focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SearchableMultiSelectField({
  label,
  options,
  selected,
  onToggle,
  helperText,
  emptyText = 'No options available.',
  searchPlaceholder = 'Search...',
}) {
  const [query, setQuery] = useState('');

  const filteredOptions = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery) return options;

    return options.filter((option) => {
      const haystack = [
        option.name,
        option.meta,
        option.searchText,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(trimmedQuery);
    });
  }, [options, query]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{label}</div>
        {helperText ? <div className="text-xs text-gray-500">{helperText}</div> : null}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-10 py-2 text-sm text-gray-200 outline-none transition-colors focus:border-blue-500"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 transition-colors hover:text-gray-200"
            aria-label={`Clear ${label} search`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-gray-800 bg-gray-950/70 p-3">
        {filteredOptions.length === 0 ? (
          <div className="text-sm text-gray-500">{emptyText}</div>
        ) : filteredOptions.map((option) => {
          const isSelected = selected.includes(option.id);
          return (
            <label
              key={option.id}
              className={`flex cursor-pointer items-start gap-3 border-b px-1 py-2.5 text-sm transition-colors last:border-b-0 ${
                isSelected
                  ? 'border-gray-800 text-green-100'
                  : 'border-gray-800 text-gray-200'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(option.id)}
                className="mt-1 h-3.5 w-3.5 rounded border-gray-600 bg-gray-900 text-green-500 focus:ring-green-500"
              />
              <div className="min-w-0">
                <div className="font-medium">{option.name}</div>
                {option.meta ? <div className="text-xs text-gray-500">{option.meta}</div> : null}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function MonitoringChart({ analysis }) {
  if (!analysis?.series?.length) {
    return <div className="text-sm text-gray-500">No monitoring series selected.</div>;
  }

  if (!analysis.chart.some((row) => analysis.series.some((series) => row[series.key] != null))) {
    return <div className="text-sm text-gray-500">No readings are available for this monitoring window.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
        <span>{analysis.duration.label}</span>
        <span>{formatDateRange(analysis.duration.start, analysis.duration.end)}</span>
        <span>Bucketed by {BUCKET_LABELS[analysis.bucketUnit] || analysis.bucketUnit}</span>
      </div>
      <div className="h-96 rounded-xl border border-gray-800 bg-gray-950/50 p-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={analysis.chart} margin={{ top: 16, right: 16, left: 0, bottom: 24 }}>
            <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke="#6b7280" tick={{ fontSize: 12 }} angle={-20} textAnchor="end" height={60} />
            <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              labelFormatter={(_, payload) => formatBucketRange(
                payload?.[0]?.payload?.bucketStart,
                analysis.bucketUnit,
                analysis.duration.start,
                analysis.duration.end,
              )}
              formatter={(value) => [formatValue(value), 'Average']}
            />
            <Legend />
            {analysis.series.map((series, index) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                name={series.label}
                fill={SERIES_COLORS[index % SERIES_COLORS.length]}
                radius={[6, 6, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CompareChart({ analysis }) {
  if (!analysis?.series?.length) {
    return <div className="text-sm text-gray-500">No series selected for interval comparison.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
        <span>{formatExclusiveDateRange(analysis.current.start, analysis.current.end)}</span>
        <span>vs</span>
        <span>{formatExclusiveDateRange(analysis.previous.start, analysis.previous.end)}</span>
      </div>
      <div className="h-80 rounded-xl border border-gray-800 bg-gray-950/50 p-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={analysis.chart} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke="#6b7280" tick={{ fontSize: 12 }} />
            <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              formatter={(value) => [formatValue(value), 'Average']}
            />
            <Legend />
            {analysis.series.map((series, index) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                name={series.label}
                fill={SERIES_COLORS[index % SERIES_COLORS.length]}
                radius={[6, 6, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {analysis.series.map((series, index) => {
          const deltaPositive = (series.delta || 0) >= 0;
          return (
            <div key={series.key} className="rounded-xl border border-gray-800 bg-gray-950/60 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{series.label}</div>
                  {'sensorType' in series ? (
                    <div className="text-xs text-gray-500">{series.sensorType}</div>
                  ) : null}
                </div>
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-gray-800 bg-gray-900/70 p-3">
                  <div className="text-xs uppercase tracking-[0.12em] text-gray-500">{analysis.previous.label}</div>
                  <div className="mt-1 text-xs text-gray-500">{formatExclusiveDateRange(analysis.previous.start, analysis.previous.end)}</div>
                  <div className="mt-2 text-lg font-semibold text-gray-100">{formatValue(series.previousValue)}</div>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-900/70 p-3">
                  <div className="text-xs uppercase tracking-[0.12em] text-gray-500">{analysis.current.label}</div>
                  <div className="mt-1 text-xs text-gray-500">{formatExclusiveDateRange(analysis.current.start, analysis.current.end)}</div>
                  <div className="mt-2 text-lg font-semibold text-gray-100">{formatValue(series.currentValue)}</div>
                </div>
              </div>
              <div className={`flex items-center gap-2 text-sm ${deltaPositive ? 'text-green-300' : 'text-red-300'}`}>
                {deltaPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                <span>
                  Delta {series.delta == null ? 'No data' : `${series.delta > 0 ? '+' : ''}${series.delta}`}
                  {series.percentChange == null ? '' : ` (${series.percentChange > 0 ? '+' : ''}${series.percentChange}%)`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UnitsComparisonChart({ analysis }) {
  if (!analysis?.rankings?.length) {
    return <div className="text-sm text-gray-500">No unit comparison data available.</div>;
  }

  const rankingsWithData = analysis.rankings.filter((ranking) => ranking.units.length > 0);
  if (!rankingsWithData.length) {
    return <div className="text-sm text-gray-500">No readings are available for the selected period.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
        <span>{formatExclusiveDateRange(analysis.period.start, analysis.period.end)}</span>
        <span>Ranking {analysis.comparisonLevel}s by decreasing average value</span>
      </div>

      {rankingsWithData.map((ranking, rankingIndex) => {
        const chartConfig = analysis.charts.find((chart) => chart.key === ranking.key);

        return (
        <div key={ranking.key} className="rounded-xl border border-gray-800 p-4 space-y-4">
          <div>
            <div className="text-base font-semibold text-white">{ranking.label}</div>
            <div className="text-xs uppercase tracking-[0.12em] text-gray-500">
              {ranking.units.length} {analysis.comparisonLevel} units ranked
            </div>
          </div>

          {chartConfig ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <span>Trend lines bucketed by {BUCKET_LABELS[chartConfig.bucketUnit] || chartConfig.bucketUnit}</span>
                {chartConfig.chartTruncated ? <span>Showing top 10 lines for readability</span> : null}
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartConfig.chart} margin={{ top: 16, right: 16, left: 0, bottom: 24 }}>
                    <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                    <XAxis dataKey="label" stroke="#6b7280" tick={{ fontSize: 12 }} angle={-20} textAnchor="end" height={60} />
                    <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                      formatter={(value) => [formatValue(value), 'Average']}
                    />
                    <Legend />
                    {chartConfig.visibleUnits.map((unit, unitIndex) => (
                      <Line
                        key={`line:${ranking.key}:${unit.unitId}`}
                        type="monotone"
                        dataKey={`unit:${unit.unitId}`}
                        name={unit.unitName}
                        stroke={SERIES_COLORS[(rankingIndex + unitIndex) % SERIES_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            {ranking.units.map((unit) => (
              <div
                key={`${ranking.key}:${unit.unitId}`}
                className="flex items-center justify-between gap-4 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-orange-900/50 text-xs font-semibold text-orange-200">
                    {unit.rank}
                  </span>
                  <span className="truncate text-gray-200">{unit.unitName}</span>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-white">{formatValue(unit.value)}</div>
                  <div className="text-xs text-gray-500">{unit.count} readings</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
      })}
    </div>
  );
}

function formatComparisonOptionMeta(userRole, comparisonLevel, districtName, blockName) {
  if (comparisonLevel === 'block' && userRole === 'state') {
    return districtName || '';
  }

  if (comparisonLevel === 'panchayat' && userRole === 'state') {
    return [districtName, blockName].filter(Boolean).join(' / ');
  }

  if (comparisonLevel === 'panchayat' && userRole === 'district') {
    return blockName || '';
  }

  return '';
}

export default function TrendAnalysisPanel() {
  const { user } = useAuth();
  const [mode, setMode] = useState('monitor');
  const [districtOptions, setDistrictOptions] = useState([]);
  const [districtId, setDistrictId] = useState('');
  const [blockOptions, setBlockOptions] = useState([]);
  const [blockId, setBlockId] = useState('');
  const [panchayatOptions, setPanchayatOptions] = useState([]);
  const [panchayatId, setPanchayatId] = useState('');
  const [selectedSensorTypes, setSelectedSensorTypes] = useState([]);
  const [durationValue, setDurationValue] = useState(6);
  const [durationUnit, setDurationUnit] = useState('month');
  const [bucketUnit, setBucketUnit] = useState('week');
  const [comparisonLevel, setComparisonLevel] = useState(getDefaultComparisonLevel(user?.role));
  const [comparisonUnitIds, setComparisonUnitIds] = useState([]);
  const [unitsPeriodStart, setUnitsPeriodStart] = useState(getDateDaysAgo(29));
  const [unitsPeriodEnd, setUnitsPeriodEnd] = useState(getTodayDateInputValue());
  const [comparePreviousStart, setComparePreviousStart] = useState(getDateDaysAgo(59));
  const [comparePreviousEnd, setComparePreviousEnd] = useState(getDateDaysAgo(30));
  const [compareCurrentStart, setCompareCurrentStart] = useState(getDateDaysAgo(29));
  const [compareCurrentEnd, setCompareCurrentEnd] = useState(getTodayDateInputValue());
  const [report, setReport] = useState(null);
  const [comparisonUnitOptions, setComparisonUnitOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.role !== 'state') {
      setDistrictOptions([]);
      return undefined;
    }

    let active = true;
    getDistricts()
      .then((rows) => {
        if (!active) return;
        setDistrictOptions(rows);
      })
      .catch(() => {
        if (!active) return;
        setDistrictOptions([]);
      });

    return () => {
      active = false;
    };
  }, [user?.role]);

  useEffect(() => {
    const nextDistrictId = user?.role === 'district' ? String(user.location_id) : districtId;
    if (!nextDistrictId) {
      setBlockOptions([]);
      setBlockId('');
      return undefined;
    }

    if (!['state', 'district'].includes(user?.role)) {
      return undefined;
    }

    let active = true;
    getBlocks(nextDistrictId)
      .then((rows) => {
        if (!active) return;
        setBlockOptions(rows);
      })
      .catch(() => {
        if (!active) return;
        setBlockOptions([]);
      });

    return () => {
      active = false;
    };
  }, [districtId, user?.location_id, user?.role]);

  useEffect(() => {
    const nextBlockId = user?.role === 'block' ? String(user.location_id) : blockId;
    if (!nextBlockId) {
      setPanchayatOptions([]);
      setPanchayatId('');
      return undefined;
    }

    if (!['state', 'district', 'block'].includes(user?.role)) {
      return undefined;
    }

    let active = true;
    getPanchayats(nextBlockId)
      .then((rows) => {
        if (!active) return;
        setPanchayatOptions(rows);
      })
      .catch(() => {
        if (!active) return;
        setPanchayatOptions([]);
      });

    return () => {
      active = false;
    };
  }, [blockId, user?.location_id, user?.role]);

  const bucketOptions = useMemo(() => (
    getAvailableBucketUnits(durationValue, durationUnit).map((unit) => ({
      id: unit,
      name: BUCKET_LABELS[unit],
    }))
  ), [durationUnit, durationValue]);

  const comparisonLevelOptions = useMemo(() => (
    getComparisonLevelOptions(user?.role)
  ), [user?.role]);

  useEffect(() => {
    if (!comparisonLevelOptions.some((option) => option.id === comparisonLevel)) {
      setComparisonLevel(comparisonLevelOptions[0]?.id || '');
    }
  }, [comparisonLevel, comparisonLevelOptions]);

  useEffect(() => {
    if (!comparisonLevelOptions.length && mode === 'units') {
      setMode('monitor');
    }
  }, [comparisonLevelOptions.length, mode]);

  useEffect(() => {
    if (mode !== 'units' || !comparisonLevel) {
      setComparisonUnitOptions([]);
      return undefined;
    }

    let active = true;

    const loadComparisonUnits = async () => {
      try {
        if (comparisonLevel === 'district') {
          const rows = await getDistricts();
          if (!active) return;
          setComparisonUnitOptions(rows.map((row) => ({
            id: String(row.id),
            name: row.name,
            meta: '',
            searchText: row.name,
          })));
          return;
        }

        if (comparisonLevel === 'block') {
          if (user?.role === 'state') {
            const districts = await getDistricts();
            const blockGroups = await Promise.all(districts.map(async (district) => {
              const blocks = await getBlocks(district.id);
              return blocks.map((block) => ({
                id: String(block.id),
                name: block.name,
                meta: formatComparisonOptionMeta(user.role, comparisonLevel, district.name),
                searchText: `${block.name} ${district.name}`,
              }));
            }));
            if (!active) return;
            setComparisonUnitOptions(blockGroups.flat());
            return;
          }

          const rows = await getBlocks(user?.location_id);
          if (!active) return;
          setComparisonUnitOptions(rows.map((row) => ({
            id: String(row.id),
            name: row.name,
            meta: '',
            searchText: row.name,
          })));
          return;
        }

        if (comparisonLevel === 'panchayat') {
          if (user?.role === 'block') {
            const rows = await getPanchayats(user.location_id);
            if (!active) return;
            setComparisonUnitOptions(rows.map((row) => ({
              id: String(row.id),
              name: row.name,
              meta: '',
              searchText: row.name,
            })));
            return;
          }

          if (user?.role === 'district') {
            const blocks = await getBlocks(user.location_id);
            const panchayatGroups = await Promise.all(blocks.map(async (block) => {
              const panchayats = await getPanchayats(block.id);
              return panchayats.map((panchayat) => ({
                id: String(panchayat.id),
                name: panchayat.name,
                meta: formatComparisonOptionMeta(user.role, comparisonLevel, '', block.name),
                searchText: `${panchayat.name} ${block.name}`,
              }));
            }));
            if (!active) return;
            setComparisonUnitOptions(panchayatGroups.flat());
            return;
          }

          const districts = await getDistricts();
          const blockGroups = await Promise.all(districts.map(async (district) => {
            const blocks = await getBlocks(district.id);
            return blocks.map((block) => ({
              ...block,
              districtName: district.name,
            }));
          }));
          const allBlocks = blockGroups.flat();
          const panchayatGroups = await Promise.all(allBlocks.map(async (block) => {
            const panchayats = await getPanchayats(block.id);
            return panchayats.map((panchayat) => ({
              id: String(panchayat.id),
              name: panchayat.name,
              meta: formatComparisonOptionMeta(user.role, comparisonLevel, block.districtName, block.name),
              searchText: `${panchayat.name} ${block.name} ${block.districtName}`,
            }));
          }));
          if (!active) return;
          setComparisonUnitOptions(panchayatGroups.flat());
          return;
        }

        if (active) setComparisonUnitOptions([]);
      } catch {
        if (active) setComparisonUnitOptions([]);
      }
    };

    loadComparisonUnits();

    return () => {
      active = false;
    };
  }, [comparisonLevel, mode, user?.location_id, user?.role]);

  useEffect(() => {
    setComparisonUnitIds([]);
  }, [comparisonLevel]);

  useEffect(() => {
    const availableBucketUnits = getAvailableBucketUnits(durationValue, durationUnit);
    if (!availableBucketUnits.includes(bucketUnit)) {
      setBucketUnit(availableBucketUnits[0]);
    }
  }, [bucketUnit, durationUnit, durationValue]);

  const runAnalysis = useCallback(() => {
    const scopeParams = mode === 'units'
      ? buildScopeParams(user, '', '', '')
      : buildScopeParams(user, districtId, blockId, panchayatId);
    setLoading(true);
    setError('');

    getTrendAnalysis({
      mode,
      ...scopeParams,
      sensorTypes: selectedSensorTypes.join(','),
      durationValue,
      durationUnit,
      bucketUnit,
      comparisonLevel,
      comparisonUnitIds: comparisonUnitIds.join(','),
      comparePreviousStart,
      comparePreviousEnd,
      compareCurrentStart,
      compareCurrentEnd,
      unitsPeriodStart,
      unitsPeriodEnd,
    })
      .then((data) => {
        setReport(data);
        const availableTypeIds = new Set(data.availableSensorTypes);
        setSelectedSensorTypes((current) => current.filter((sensorType) => availableTypeIds.has(sensorType)));
      })
      .catch((err) => {
        setReport(null);
        setError(err.response?.data?.error || 'Failed to load trend analysis');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [
    blockId,
    bucketUnit,
    comparisonLevel,
    comparisonUnitIds,
    districtId,
    durationUnit,
    durationValue,
    compareCurrentEnd,
    compareCurrentStart,
    comparePreviousEnd,
    comparePreviousStart,
    unitsPeriodEnd,
    unitsPeriodStart,
    mode,
    panchayatId,
    selectedSensorTypes,
    user,
  ]);

  useEffect(() => {
    if (!user || report) return;
    runAnalysis();
  }, [report, runAnalysis, user]);

  const sensorTypeOptions = useMemo(() => (
    (report?.availableSensorTypes || []).map((sensorType) => ({
      id: sensorType,
      name: sensorType,
      meta: '',
      searchText: sensorType,
    }))
  ), [report?.availableSensorTypes]);

  const toggleSelection = (value, setter) => {
    setter((current) => (
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    ));
  };

  return (
    <section className="card p-5 space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-orange-800/40 bg-orange-900/20 p-3 text-orange-300">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Trend Analysis</h2>
            <p className="text-sm text-gray-400">
              Compare changes over time inside a selected scope with monitoring and interval comparison modes.
            </p>
          </div>
        </div>
        {report?.scope ? (
          <div className="rounded-xl border border-gray-800 bg-gray-950/60 px-4 py-3 text-sm text-gray-300">
            <div className="font-semibold text-white">{report.scope.name}</div>
            <div className="text-xs uppercase tracking-[0.14em] text-gray-500">{formatLevel(report.scope.level)}</div>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4 space-y-4">
            <div className="inline-flex rounded-lg border border-gray-700 bg-gray-900 p-1">
              {[
                { id: 'monitor', label: 'Monitoring' },
                { id: 'compare', label: 'Compare Intervals' },
                ...(comparisonLevelOptions.length ? [{ id: 'units', label: 'Compare Units' }] : []),
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setMode(option.id);
                    if (option.id === 'units') {
                      setComparisonLevel(getDefaultComparisonLevel(user?.role));
                    }
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    mode === option.id
                      ? 'bg-orange-800/60 text-orange-100'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {mode !== 'units' && user?.role === 'state' ? (
              <SelectField
                label="District"
                value={districtId}
                onChange={(value) => {
                  setDistrictId(value);
                  setBlockId('');
                  setPanchayatId('');
                }}
                options={districtOptions}
                placeholder="All districts"
              />
            ) : null}

            {mode !== 'units' && ['state', 'district'].includes(user?.role) ? (
              <SelectField
                label="Block"
                value={blockId}
                onChange={(value) => {
                  setBlockId(value);
                  setPanchayatId('');
                }}
                options={blockOptions}
                placeholder={user?.role === 'state' ? 'All blocks' : 'Any block in district'}
                disabled={user?.role === 'state' && !districtId}
              />
            ) : null}

            {mode !== 'units' && ['state', 'district', 'block'].includes(user?.role) ? (
              <SelectField
                label="Panchayat"
                value={panchayatId}
                onChange={setPanchayatId}
                options={panchayatOptions}
                placeholder="All panchayats"
                disabled={
                  (user?.role === 'state' && !blockId) ||
                  (user?.role === 'district' && !blockId) ||
                  (user?.role === 'block' && !user?.location_id)
                }
              />
            ) : null}

            {mode === 'monitor' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_130px]">
                  <label className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Range Value</div>
                    <input
                      type="number"
                      min="1"
                      value={durationValue}
                      onChange={(event) => setDurationValue(Math.max(1, Number(event.target.value) || 1))}
                      className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none transition-colors focus:border-blue-500"
                    />
                  </label>
                  <SelectField
                    label="Unit"
                    value={durationUnit}
                    onChange={setDurationUnit}
                    options={[
                      { id: 'day', name: 'Days' },
                      { id: 'week', name: 'Weeks' },
                      { id: 'month', name: 'Months' },
                      { id: 'year', name: 'Years' },
                    ]}
                    placeholder="Unit"
                  />
                </div>
                <SelectField
                  label="Bucket By"
                  value={bucketUnit}
                  onChange={setBucketUnit}
                  options={bucketOptions}
                  placeholder="Bucket size"
                />
                <div className="flex flex-wrap gap-2">
                  {MONITOR_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setDurationValue(preset.value);
                        setDurationUnit(preset.unit);
                      }}
                      className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-800"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : mode === 'compare' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3">
                  <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Interval A</div>
                    <label className="space-y-2">
                      <div className="text-xs text-gray-500">Start Date</div>
                      <input
                        type="date"
                        value={comparePreviousStart}
                        max={getTodayDateInputValue()}
                        onChange={(event) => setComparePreviousStart(event.target.value)}
                        className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none transition-colors focus:border-blue-500"
                      />
                    </label>
                    <label className="space-y-2">
                      <div className="text-xs text-gray-500">End Date</div>
                      <input
                        type="date"
                        value={comparePreviousEnd}
                        max={getTodayDateInputValue()}
                        onChange={(event) => setComparePreviousEnd(event.target.value)}
                        className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none transition-colors focus:border-blue-500"
                      />
                    </label>
                  </div>
                  <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Interval B</div>
                    <label className="space-y-2">
                      <div className="text-xs text-gray-500">Start Date</div>
                      <input
                        type="date"
                        value={compareCurrentStart}
                        max={getTodayDateInputValue()}
                        onChange={(event) => setCompareCurrentStart(event.target.value)}
                        className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none transition-colors focus:border-blue-500"
                      />
                    </label>
                    <label className="space-y-2">
                      <div className="text-xs text-gray-500">End Date</div>
                      <input
                        type="date"
                        value={compareCurrentEnd}
                        max={getTodayDateInputValue()}
                        onChange={(event) => setCompareCurrentEnd(event.target.value)}
                        className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none transition-colors focus:border-blue-500"
                      />
                    </label>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <SelectField
                  label="Administrative Level"
                  value={comparisonLevel}
                  onChange={setComparisonLevel}
                  options={comparisonLevelOptions}
                  placeholder="Select level"
                  disabled={comparisonLevelOptions.length === 0}
                />
                <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Period</div>
                  <label className="space-y-2">
                    <div className="text-xs text-gray-500">Start Date</div>
                    <input
                      type="date"
                      value={unitsPeriodStart}
                      max={getTodayDateInputValue()}
                      onChange={(event) => setUnitsPeriodStart(event.target.value)}
                      className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none transition-colors focus:border-blue-500"
                    />
                  </label>
                  <label className="space-y-2">
                    <div className="text-xs text-gray-500">End Date</div>
                    <input
                      type="date"
                      value={unitsPeriodEnd}
                      max={getTodayDateInputValue()}
                      onChange={(event) => setUnitsPeriodEnd(event.target.value)}
                      className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none transition-colors focus:border-blue-500"
                    />
                  </label>
                </div>
                <SearchableMultiSelectField
                  label="Units"
                  options={comparisonUnitOptions}
                  selected={comparisonUnitIds}
                  onToggle={(value) => toggleSelection(value, setComparisonUnitIds)}
                  helperText={comparisonUnitIds.length ? `${comparisonUnitIds.length} selected` : 'Leave empty to compare all'}
                  emptyText="Run the comparison once to load units for the selected level."
                  searchPlaceholder={`Search ${comparisonLevel || 'units'}...`}
                />
              </div>
            )}

            <button
              type="button"
              onClick={runAnalysis}
              className="w-full rounded-lg border border-orange-700/60 bg-orange-900/30 px-4 py-2.5 text-sm font-medium text-orange-100 transition-colors hover:bg-orange-900/50"
            >
              Apply Trend Analysis
            </button>
          </div>

          <SearchableMultiSelectField
            label="Sensor Types"
            options={sensorTypeOptions}
            selected={selectedSensorTypes}
            onToggle={(value) => toggleSelection(value, setSelectedSensorTypes)}
            helperText={selectedSensorTypes.length ? `${selectedSensorTypes.length} selected` : 'Leave empty to use all'}
            searchPlaceholder="Search sensor types..."
          />
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4 space-y-4">
          {loading ? (
            <div className="rounded-lg border border-orange-900/50 bg-orange-950/20 px-4 py-3 text-sm text-orange-100">
              Running trend analysis...
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {!loading && !error && report?.mode === 'monitor' ? (
            <MonitoringChart analysis={report.monitor} />
          ) : null}

          {!loading && !error && report?.mode === 'compare' ? (
            <CompareChart analysis={report.compare} />
          ) : null}

          {!loading && !error && report?.mode === 'units' ? (
            <UnitsComparisonChart analysis={report.units} />
          ) : null}
        </div>
      </div>
    </section>
  );
}
