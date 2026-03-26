import React, { useEffect, useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp, Printer } from 'lucide-react';
import { getAggregateReport, getBlocks, getPanchayats } from '../../api';
import { useAuth } from '../../context/AuthContext';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const TREND_RANGE_OPTIONS = ['24h', '7d', '30d'];
const MAX_TREND_RANGE = '30d';

function getTrendRangeDuration(range) {
  if (range === '24h') return 24 * 60 * 60 * 1000;
  if (range === '7d') return 7 * 24 * 60 * 60 * 1000;
  return 30 * 24 * 60 * 60 * 1000;
}

function filterTrendByRange(trend, trendRange) {
  if (!trend?.length) return [];
  const lastPointTime = new Date(trend[trend.length - 1].time).getTime();
  const cutoffTime = lastPointTime - getTrendRangeDuration(trendRange);
  return trend.filter((point) => new Date(point.time).getTime() >= cutoffTime);
}

function formatLevel(level) {
  return level ? `${level.charAt(0).toUpperCase()}${level.slice(1)}` : '';
}

function renderAverageRows(averages) {
  if (!averages?.length) {
    return '<tr><td colspan="3" style="padding:12px 14px;color:#6b7280;">No readings available</td></tr>';
  }

  return averages.map((item) => `
    <tr>
      <td style="padding:12px 14px;border-top:1px solid #e5e7eb;">${item.sensorType}</td>
      <td style="padding:12px 14px;border-top:1px solid #e5e7eb;">${item.average}</td>
      <td style="padding:12px 14px;border-top:1px solid #e5e7eb;">${item.count}</td>
    </tr>
  `).join('');
}

function filterAverages(averages, sensorType) {
  if (!sensorType) return averages;
  return averages.filter((item) => item.sensorType === sensorType);
}

function filterReportBySensorType(report, sensorType) {
  if (!report) return null;

  return {
    ...report,
    scope: {
      ...report.scope,
      averages: filterAverages(report.scope.averages, sensorType),
    },
    children: report.children.map((child) => ({
      ...child,
      averages: filterAverages(child.averages, sensorType),
    })),
  };
}

function collectSensorTypes(...reports) {
  const values = new Set();

  reports.filter(Boolean).forEach((report) => {
    report.scope.averages.forEach((item) => values.add(item.sensorType));
    report.children.forEach((child) => {
      child.averages.forEach((item) => values.add(item.sensorType));
    });
  });

  return Array.from(values).sort((left, right) => left.localeCompare(right));
}

function openPrintWindow(report) {
  const printWindow = window.open('', '_blank', 'width=960,height=720');
  if (!printWindow) return;

  const childSections = report.children.map((child) => `
    <section style="margin-top:24px;">
      <h3 style="margin:0 0 10px;font-size:18px;color:#111827;">${child.name}</h3>
      <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <thead style="background:#f3f4f6;text-align:left;">
          <tr>
            <th style="padding:12px 14px;">Type</th>
            <th style="padding:12px 14px;">Average</th>
            <th style="padding:12px 14px;">Sensors Used</th>
          </tr>
        </thead>
        <tbody>${renderAverageRows(child.averages)}</tbody>
      </table>
    </section>
  `).join('');

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Aggregate Sensor Report</title>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; color: #111827; background: #f9fafb; }
          h1, h2, h3 { font-family: Arial, sans-serif; }
          .meta { color: #4b5563; margin-bottom: 24px; }
          .section { margin-top: 28px; }
          @media print {
            body { margin: 18px; background: #ffffff; }
          }
        </style>
      </head>
      <body>
        <h1 style="margin:0;">Aggregate Sensor Report</h1>
        <div class="meta">
          <div><strong>Scope:</strong> ${report.scope.name} (${formatLevel(report.scope.level)})</div>
          <div><strong>Generated:</strong> ${new Date(report.generatedAt).toLocaleString()}</div>
        </div>

        <section class="section">
          <h2 style="margin:0 0 10px;">${report.scope.name} Average Readings</h2>
          <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <thead style="background:#f3f4f6;text-align:left;">
              <tr>
                <th style="padding:12px 14px;">Type</th>
                <th style="padding:12px 14px;">Average</th>
                <th style="padding:12px 14px;">Sensors Used</th>
              </tr>
            </thead>
            <tbody>${renderAverageRows(report.scope.averages)}</tbody>
          </table>
        </section>

        ${report.childLevel ? `
          <section class="section">
            <h2 style="margin:0;">${formatLevel(report.childLevel)} Breakdown</h2>
            ${childSections}
          </section>
        ` : ''}

        <script>
          window.onload = function () {
            window.print();
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function formatTrendTick(value, trendRange) {
  const date = new Date(value);
  if (trendRange === '24h') {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatTrendTooltipLabel(value) {
  return new Date(value).toLocaleString();
}

function TrendChart({ trend, trendRange }) {
  const filteredTrend = filterTrendByRange(trend, trendRange);

  if (!filteredTrend.length) {
    return (
      <div className="rounded-lg border border-dashed border-gray-700 bg-gray-950/60 px-4 py-6 text-sm text-gray-500">
        No trend data available for the selected range.
      </div>
    );
  }

  return (
    <div className="h-44 rounded-lg border border-gray-800 bg-gray-950/70 px-3 py-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={filteredTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="time"
            tickFormatter={(value) => formatTrendTick(value, trendRange)}
            stroke="#6b7280"
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            tick={{ fontSize: 12 }}
          />
          <YAxis
            stroke="#6b7280"
            tick={{ fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            labelFormatter={formatTrendTooltipLabel}
            formatter={(value) => [value, 'Average']}
            contentStyle={{
              background: '#111827',
              border: '1px solid #374151',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelStyle={{ color: '#9ca3af' }}
            itemStyle={{ color: '#22c55e' }}
          />
          <Line
            type="monotone"
            dataKey="average"
            stroke="#22c55e"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function AverageTable({
  averages,
  tableKey,
  expandedGraphs,
  onToggleGraph,
  showAllGraphs,
  trendRange,
  graphTrendRanges,
  onTrendRangeChange,
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-800">
      <table className="w-full text-sm">
        <thead className="bg-gray-900/70 text-left text-gray-400">
          <tr>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Average</th>
            <th className="px-4 py-3 font-medium">Sensors Used</th>
            <th className="px-4 py-3 font-medium">Graph</th>
          </tr>
        </thead>
        <tbody>
          {averages.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-4 text-gray-500">No readings available</td>
            </tr>
          ) : averages.map((item) => {
            const graphKey = `${tableKey}:${item.sensorType}`;
            const isExpanded = showAllGraphs || Boolean(expandedGraphs[graphKey]);
            const activeTrendRange = graphTrendRanges[graphKey] || trendRange;

            return (
              <React.Fragment key={graphKey}>
                <tr className="border-t border-gray-800">
                  <td className="px-4 py-3 text-gray-200">{item.sensorType}</td>
                  <td className="px-4 py-3 font-medium text-green-300">{item.average}</td>
                  <td className="px-4 py-3 text-gray-400">{item.count}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onToggleGraph(graphKey)}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-200 transition-colors hover:bg-gray-800"
                    >
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {isExpanded ? 'Hide Graph' : 'View Graph'}
                    </button>
                  </td>
                </tr>
                {isExpanded ? (
                  <tr className="border-t border-gray-900 bg-gray-950/40">
                    <td colSpan={4} className="px-4 py-4">
                      <div className="mb-3 flex justify-end">
                        <div className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-900 p-1">
                          {TREND_RANGE_OPTIONS.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => onTrendRangeChange(graphKey, option)}
                              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                activeTrendRange === option
                                  ? 'bg-green-800/60 text-green-200'
                                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                      <TrendChart trend={item.trend} trendRange={activeTrendRange} />
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SelectField({ label, value, options, onChange, placeholder, disabled = false }) {
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

function SearchableSelectField({ label, value, options, onChange, placeholder, disabled = false }) {
  const selectedOption = options.find((option) => option.id === value) || null;
  const [search, setSearch] = useState(selectedOption?.name || '');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setSearch(selectedOption?.name || '');
  }, [selectedOption?.name]);

  const filteredOptions = options.filter((option) =>
    option.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <label className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{label}</div>
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setOpen(true);
            if (value) onChange('');
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => {
              setOpen(false);
              setSearch(selectedOption?.name || '');
            }, 120);
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none transition-colors focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        />

        {open && !disabled ? (
          <div className="absolute z-10 mt-2 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-2xl">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No matches found</div>
            ) : filteredOptions.map((option) => (
              <button
                key={option.id || 'all'}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(option.id);
                  setSearch(option.name);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-2 text-left text-sm transition-colors ${
                  option.id === value
                    ? 'bg-blue-950/60 text-blue-200'
                    : 'text-gray-200 hover:bg-gray-800'
                }`}
              >
                {option.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </label>
  );
}

function DrilldownCard({
  title,
  subtitle,
  report,
  loading,
  error,
  emptyMessage,
  children,
  expandedGraphs,
  onToggleGraph,
  showAllGraphs,
  tableKeyPrefix,
  trendRange,
  graphTrendRanges,
  onGraphTrendRangeChange,
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4 space-y-4">
      <div>
        <h4 className="text-base font-semibold text-white">{title}</h4>
        {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
      </div>

      {children}

      {loading ? <div className="text-sm text-gray-400">Loading aggregated report...</div> : null}
      {!loading && error ? <div className="text-sm text-red-400">{error}</div> : null}
      {!loading && !error && report ? (
        <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold text-white">{report.scope.name}</div>
            <div className="text-xs uppercase tracking-[0.16em] text-gray-500">
              {formatLevel(report.scope.level)}
            </div>
          </div>
          <AverageTable
            averages={report.scope.averages}
            tableKey={`${tableKeyPrefix}:${report.scope.level}:${report.scope.name}`}
            expandedGraphs={expandedGraphs}
            onToggleGraph={onToggleGraph}
            showAllGraphs={showAllGraphs}
            trendRange={trendRange}
            graphTrendRanges={graphTrendRanges}
            onTrendRangeChange={onGraphTrendRangeChange}
          />
        </div>
      ) : null}
      {!loading && !error && !report ? <div className="text-sm text-gray-500">{emptyMessage}</div> : null}
    </div>
  );
}

export default function AggregateReportPanel({ report, loading, error, trendRange, onTrendRangeChange }) {
  const { user } = useAuth();
  const [selectedSensorType, setSelectedSensorType] = useState('');
  const [showAllGraphs, setShowAllGraphs] = useState(false);
  const [expandedGraphs, setExpandedGraphs] = useState({});
  const [graphTrendRanges, setGraphTrendRanges] = useState({});

  const districtOptions = report?.childLevel === 'district'
    ? report.children.map(({ id, name }) => ({ id, name }))
    : [];

  const [stateBlockDistrictId, setStateBlockDistrictId] = useState('');
  const [stateBlockOptions, setStateBlockOptions] = useState([]);
  const [stateBlockId, setStateBlockId] = useState('');
  const [stateBlockReport, setStateBlockReport] = useState(null);
  const [stateBlockLoading, setStateBlockLoading] = useState(false);
  const [stateBlockError, setStateBlockError] = useState('');

  const [statePanchayatDistrictId, setStatePanchayatDistrictId] = useState('');
  const [statePanchayatBlockOptions, setStatePanchayatBlockOptions] = useState([]);
  const [statePanchayatBlockId, setStatePanchayatBlockId] = useState('');
  const [statePanchayatOptions, setStatePanchayatOptions] = useState([]);
  const [statePanchayatId, setStatePanchayatId] = useState('');
  const [statePanchayatReport, setStatePanchayatReport] = useState(null);
  const [statePanchayatLoading, setStatePanchayatLoading] = useState(false);
  const [statePanchayatError, setStatePanchayatError] = useState('');

  const [districtPanchayatBlockOptions, setDistrictPanchayatBlockOptions] = useState([]);
  const [districtPanchayatBlockId, setDistrictPanchayatBlockId] = useState('');
  const [districtPanchayatOptions, setDistrictPanchayatOptions] = useState([]);
  const [districtPanchayatId, setDistrictPanchayatId] = useState('');
  const [districtPanchayatReport, setDistrictPanchayatReport] = useState(null);
  const [districtPanchayatLoading, setDistrictPanchayatLoading] = useState(false);
  const [districtPanchayatError, setDistrictPanchayatError] = useState('');

  const sensorTypeOptions = [
    { id: '', name: 'All sensor types' },
    ...collectSensorTypes(report, stateBlockReport, statePanchayatReport, districtPanchayatReport)
      .map((sensorType) => ({ id: sensorType, name: sensorType })),
  ];

  const filteredReport = filterReportBySensorType(report, selectedSensorType);
  const filteredStateBlockReport = filterReportBySensorType(stateBlockReport, selectedSensorType);
  const filteredStatePanchayatReport = filterReportBySensorType(statePanchayatReport, selectedSensorType);
  const filteredDistrictPanchayatReport = filterReportBySensorType(districtPanchayatReport, selectedSensorType);

  useEffect(() => {
    if (!selectedSensorType) return;
    const exists = sensorTypeOptions.some((option) => option.id === selectedSensorType);
    if (!exists) {
      setSelectedSensorType('');
    }
  }, [selectedSensorType, sensorTypeOptions]);

  useEffect(() => {
    setShowAllGraphs(false);
    setExpandedGraphs({});
    setGraphTrendRanges({});
  }, [selectedSensorType]);

  useEffect(() => {
    setStateBlockDistrictId('');
    setStateBlockOptions([]);
    setStateBlockId('');
    setStateBlockReport(null);
    setStateBlockError('');

    setStatePanchayatDistrictId('');
    setStatePanchayatBlockOptions([]);
    setStatePanchayatBlockId('');
    setStatePanchayatOptions([]);
    setStatePanchayatId('');
    setStatePanchayatReport(null);
    setStatePanchayatError('');

    setDistrictPanchayatBlockOptions([]);
    setDistrictPanchayatBlockId('');
    setDistrictPanchayatOptions([]);
    setDistrictPanchayatId('');
    setDistrictPanchayatReport(null);
    setDistrictPanchayatError('');
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== 'state' || !stateBlockDistrictId) {
      setStateBlockOptions([]);
      setStateBlockId('');
      setStateBlockReport(null);
      setStateBlockError('');
      return;
    }

    let active = true;
    setStateBlockError('');
    getBlocks(stateBlockDistrictId)
      .then((rows) => {
        if (!active) return;
        setStateBlockOptions(rows);
      })
      .catch((err) => {
        if (!active) return;
        setStateBlockOptions([]);
        setStateBlockError(err.response?.data?.error || 'Failed to load blocks');
      });

    return () => {
      active = false;
    };
  }, [stateBlockDistrictId, user?.role]);

  useEffect(() => {
    if (user?.role !== 'state' || !stateBlockDistrictId || !stateBlockId) {
      setStateBlockLoading(false);
      setStateBlockReport(null);
      setStateBlockError('');
      return;
    }

    let active = true;
    setStateBlockLoading(true);
    setStateBlockError('');

    getAggregateReport({
      districtId: stateBlockDistrictId,
      blockId: stateBlockId,
      includeChildren: false,
      trendRange: MAX_TREND_RANGE,
    })
      .then((data) => {
        if (!active) return;
        setStateBlockReport(data);
      })
      .catch((err) => {
        if (!active) return;
        setStateBlockReport(null);
        setStateBlockError(err.response?.data?.error || 'Failed to load aggregated report');
      })
      .finally(() => {
        if (active) setStateBlockLoading(false);
      });

    return () => {
      active = false;
    };
  }, [stateBlockDistrictId, stateBlockId, user?.role]);

  useEffect(() => {
    if (user?.role !== 'state' || !statePanchayatDistrictId) {
      setStatePanchayatBlockOptions([]);
      setStatePanchayatBlockId('');
      setStatePanchayatOptions([]);
      setStatePanchayatId('');
      setStatePanchayatReport(null);
      setStatePanchayatError('');
      return;
    }

    let active = true;
    setStatePanchayatError('');
    getBlocks(statePanchayatDistrictId)
      .then((rows) => {
        if (!active) return;
        setStatePanchayatBlockOptions(rows);
      })
      .catch((err) => {
        if (!active) return;
        setStatePanchayatBlockOptions([]);
        setStatePanchayatError(err.response?.data?.error || 'Failed to load blocks');
      });

    return () => {
      active = false;
    };
  }, [statePanchayatDistrictId, user?.role]);

  useEffect(() => {
    if (!statePanchayatDistrictId) {
      setStatePanchayatBlockId('');
      setStatePanchayatOptions([]);
      setStatePanchayatId('');
      setStatePanchayatReport(null);
    }
  }, [statePanchayatDistrictId]);

  useEffect(() => {
    if (!statePanchayatBlockId) {
      setStatePanchayatOptions([]);
      setStatePanchayatId('');
      setStatePanchayatReport(null);
      return;
    }

    let active = true;
    setStatePanchayatError('');
    getPanchayats(statePanchayatBlockId)
      .then((rows) => {
        if (!active) return;
        setStatePanchayatOptions(rows);
      })
      .catch((err) => {
        if (!active) return;
        setStatePanchayatOptions([]);
        setStatePanchayatError(err.response?.data?.error || 'Failed to load panchayats');
      });

    return () => {
      active = false;
    };
  }, [statePanchayatBlockId]);

  useEffect(() => {
    if (user?.role !== 'state' || !statePanchayatDistrictId || !statePanchayatBlockId || !statePanchayatId) {
      setStatePanchayatLoading(false);
      setStatePanchayatReport(null);
      if (!statePanchayatDistrictId || !statePanchayatBlockId || !statePanchayatId) {
        setStatePanchayatError('');
      }
      return;
    }

    let active = true;
    setStatePanchayatLoading(true);
    setStatePanchayatError('');

    getAggregateReport({
      districtId: statePanchayatDistrictId,
      blockId: statePanchayatBlockId,
      panchayatId: statePanchayatId,
      includeChildren: false,
      trendRange: MAX_TREND_RANGE,
    })
      .then((data) => {
        if (!active) return;
        setStatePanchayatReport(data);
      })
      .catch((err) => {
        if (!active) return;
        setStatePanchayatReport(null);
        setStatePanchayatError(err.response?.data?.error || 'Failed to load aggregated report');
      })
      .finally(() => {
        if (active) setStatePanchayatLoading(false);
      });

    return () => {
      active = false;
    };
  }, [statePanchayatBlockId, statePanchayatDistrictId, statePanchayatId, user?.role]);

  useEffect(() => {
    if (user?.role !== 'district' || !user.location_id) {
      setDistrictPanchayatBlockOptions([]);
      return;
    }

    let active = true;
    setDistrictPanchayatError('');
    getBlocks(user.location_id)
      .then((rows) => {
        if (!active) return;
        setDistrictPanchayatBlockOptions(rows);
      })
      .catch((err) => {
        if (!active) return;
        setDistrictPanchayatBlockOptions([]);
        setDistrictPanchayatError(err.response?.data?.error || 'Failed to load blocks');
      });

    return () => {
      active = false;
    };
  }, [user?.location_id, user?.role]);

  useEffect(() => {
    if (!districtPanchayatBlockId) {
      setDistrictPanchayatOptions([]);
      setDistrictPanchayatId('');
      setDistrictPanchayatReport(null);
      return;
    }

    let active = true;
    setDistrictPanchayatError('');
    getPanchayats(districtPanchayatBlockId)
      .then((rows) => {
        if (!active) return;
        setDistrictPanchayatOptions(rows);
      })
      .catch((err) => {
        if (!active) return;
        setDistrictPanchayatOptions([]);
        setDistrictPanchayatError(err.response?.data?.error || 'Failed to load panchayats');
      });

    return () => {
      active = false;
    };
  }, [districtPanchayatBlockId]);

  useEffect(() => {
    if (user?.role !== 'district' || !user.location_id || !districtPanchayatBlockId || !districtPanchayatId) {
      setDistrictPanchayatLoading(false);
      setDistrictPanchayatReport(null);
      if (!districtPanchayatBlockId || !districtPanchayatId) {
        setDistrictPanchayatError('');
      }
      return;
    }

    let active = true;
    setDistrictPanchayatLoading(true);
    setDistrictPanchayatError('');

    getAggregateReport({
      districtId: user.location_id,
      blockId: districtPanchayatBlockId,
      panchayatId: districtPanchayatId,
      includeChildren: false,
      trendRange: MAX_TREND_RANGE,
    })
      .then((data) => {
        if (!active) return;
        setDistrictPanchayatReport(data);
      })
      .catch((err) => {
        if (!active) return;
        setDistrictPanchayatReport(null);
        setDistrictPanchayatError(err.response?.data?.error || 'Failed to load aggregated report');
      })
      .finally(() => {
        if (active) setDistrictPanchayatLoading(false);
      });

    return () => {
      active = false;
    };
  }, [districtPanchayatBlockId, districtPanchayatId, user?.location_id, user?.role]);

  if (loading && !report) {
    return (
      <section className="card p-5">
        <div className="text-sm text-gray-400">Loading aggregated report...</div>
      </section>
    );
  }

  if (error && !report) {
    return (
      <section className="card p-5 border-red-800/50">
        <div className="text-sm text-red-400">{error}</div>
      </section>
    );
  }

  if (!filteredReport) return null;

  const toggleGraph = (graphKey) => {
    setExpandedGraphs((current) => ({
      ...current,
      [graphKey]: !current[graphKey],
    }));
  };

  const handleGraphTrendRangeChange = (graphKey, nextRange) => {
    setGraphTrendRanges((current) => ({
      ...current,
      [graphKey]: nextRange,
    }));
  };

  return (
    <section className="card p-5 space-y-5">
      {loading ? (
        <div className="rounded-lg border border-blue-900/50 bg-blue-950/30 px-4 py-3 text-sm text-blue-200">
          Refreshing aggregated report...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-green-800/40 bg-green-900/20 p-3 text-green-300">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Aggregated Report</h2>
            <p className="text-sm text-gray-400">
              {filteredReport.scope.name} · {formatLevel(filteredReport.scope.level)} level averages
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-900 p-1">
            {TREND_RANGE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onTrendRangeChange(option)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  trendRange === option
                    ? 'bg-green-800/60 text-green-200'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowAllGraphs((current) => !current)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-700"
          >
            {showAllGraphs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showAllGraphs ? 'Hide All Graphs' : 'View All Graphs'}
          </button>
          <button
            onClick={() => openPrintWindow(filteredReport)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-700"
          >
            <Printer className="h-4 w-4" />
            Print PDF Report
          </button>
        </div>
      </div>

      <div className="max-w-md">
        <SearchableSelectField
          label="Sensor Type"
          value={selectedSensorType}
          options={sensorTypeOptions}
          onChange={setSelectedSensorType}
          placeholder="Search sensor type"
        />
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-500">
            {filteredReport.scope.name}
          </h3>
        </div>
        <AverageTable
          averages={filteredReport.scope.averages}
          tableKey={`scope:${filteredReport.scope.level}:${filteredReport.scope.name}`}
          expandedGraphs={expandedGraphs}
          onToggleGraph={toggleGraph}
          showAllGraphs={showAllGraphs}
          trendRange={trendRange}
          graphTrendRanges={graphTrendRanges}
          onTrendRangeChange={handleGraphTrendRangeChange}
        />
      </div>

      {filteredReport.childLevel ? (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-500">
            {formatLevel(filteredReport.childLevel)} Breakdown
          </h3>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {filteredReport.children.map((child) => (
              <div key={child.id} className="rounded-xl border border-gray-800 bg-gray-950/60 p-4 space-y-3">
                <div>
                  <div className="text-base font-semibold text-white">{child.name}</div>
                  <div className="text-xs uppercase tracking-[0.16em] text-gray-500">{formatLevel(child.level)}</div>
                </div>
                <AverageTable
                  averages={child.averages}
                  tableKey={`child:${child.level}:${child.id}`}
                  expandedGraphs={expandedGraphs}
                  onToggleGraph={toggleGraph}
                  showAllGraphs={showAllGraphs}
                  trendRange={trendRange}
                  graphTrendRanges={graphTrendRanges}
                  onTrendRangeChange={handleGraphTrendRangeChange}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {user?.role === 'state' ? (
        <>
          <DrilldownCard
            title="Block Breakdown"
            subtitle="Select a district and block to view the aggregated averages for that block."
            report={filteredStateBlockReport}
            loading={stateBlockLoading}
            error={stateBlockError}
            emptyMessage="Choose a district and block to view block-level averages."
            expandedGraphs={expandedGraphs}
            onToggleGraph={toggleGraph}
            showAllGraphs={showAllGraphs}
            tableKeyPrefix="drilldown:block"
            trendRange={trendRange}
            graphTrendRanges={graphTrendRanges}
            onGraphTrendRangeChange={handleGraphTrendRangeChange}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SelectField
                label="District"
                value={stateBlockDistrictId}
                options={districtOptions}
                onChange={(value) => {
                  setStateBlockDistrictId(value);
                  setStateBlockId('');
                  setStateBlockReport(null);
                  setStateBlockError('');
                }}
                placeholder="Select district"
              />
              <SelectField
                label="Block"
                value={stateBlockId}
                options={stateBlockOptions}
                onChange={(value) => {
                  setStateBlockId(value);
                  setStateBlockReport(null);
                  setStateBlockError('');
                }}
                placeholder="Select block"
                disabled={!stateBlockDistrictId}
              />
            </div>
          </DrilldownCard>

          <DrilldownCard
            title="Panchayat Breakdown"
            subtitle="Select a district, block, and panchayat to view the aggregated averages for that panchayat."
            report={filteredStatePanchayatReport}
            loading={statePanchayatLoading}
            error={statePanchayatError}
            emptyMessage="Choose a district, block, and panchayat to view panchayat-level averages."
            expandedGraphs={expandedGraphs}
            onToggleGraph={toggleGraph}
            showAllGraphs={showAllGraphs}
            tableKeyPrefix="drilldown:panchayat"
            trendRange={trendRange}
            graphTrendRanges={graphTrendRanges}
            onGraphTrendRangeChange={handleGraphTrendRangeChange}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <SelectField
                label="District"
                value={statePanchayatDistrictId}
                options={districtOptions}
                onChange={(value) => {
                  setStatePanchayatDistrictId(value);
                  setStatePanchayatBlockId('');
                  setStatePanchayatId('');
                  setStatePanchayatReport(null);
                  setStatePanchayatError('');
                }}
                placeholder="Select district"
              />
              <SelectField
                label="Block"
                value={statePanchayatBlockId}
                options={statePanchayatBlockOptions}
                onChange={(value) => {
                  setStatePanchayatBlockId(value);
                  setStatePanchayatId('');
                  setStatePanchayatReport(null);
                  setStatePanchayatError('');
                }}
                placeholder="Select block"
                disabled={!statePanchayatDistrictId}
              />
              <SelectField
                label="Panchayat"
                value={statePanchayatId}
                options={statePanchayatOptions}
                onChange={(value) => {
                  setStatePanchayatId(value);
                  setStatePanchayatReport(null);
                  setStatePanchayatError('');
                }}
                placeholder="Select panchayat"
                disabled={!statePanchayatBlockId}
              />
            </div>
          </DrilldownCard>
        </>
      ) : null}

      {user?.role === 'district' ? (
        <DrilldownCard
          title="Panchayat Breakdown"
          subtitle="Select a block and panchayat to view the aggregated averages for that panchayat."
          report={filteredDistrictPanchayatReport}
          loading={districtPanchayatLoading}
          error={districtPanchayatError}
          emptyMessage="Choose a block and panchayat to view panchayat-level averages."
          expandedGraphs={expandedGraphs}
          onToggleGraph={toggleGraph}
          showAllGraphs={showAllGraphs}
          tableKeyPrefix="drilldown:district-panchayat"
          trendRange={trendRange}
          graphTrendRanges={graphTrendRanges}
          onGraphTrendRangeChange={handleGraphTrendRangeChange}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectField
              label="Block"
              value={districtPanchayatBlockId}
              options={districtPanchayatBlockOptions}
              onChange={(value) => {
                setDistrictPanchayatBlockId(value);
                setDistrictPanchayatId('');
                setDistrictPanchayatReport(null);
                setDistrictPanchayatError('');
              }}
              placeholder="Select block"
            />
            <SelectField
              label="Panchayat"
              value={districtPanchayatId}
              options={districtPanchayatOptions}
              onChange={(value) => {
                setDistrictPanchayatId(value);
                setDistrictPanchayatReport(null);
                setDistrictPanchayatError('');
              }}
              placeholder="Select panchayat"
              disabled={!districtPanchayatBlockId}
            />
          </div>
        </DrilldownCard>
      ) : null}
    </section>
  );
}
