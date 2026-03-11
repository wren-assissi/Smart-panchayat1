import React from 'react';
import { BarChart3, Printer } from 'lucide-react';

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

function AverageTable({ averages }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-800">
      <table className="w-full text-sm">
        <thead className="bg-gray-900/70 text-left text-gray-400">
          <tr>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Average</th>
            <th className="px-4 py-3 font-medium">Sensors Used</th>
          </tr>
        </thead>
        <tbody>
          {averages.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-4 py-4 text-gray-500">No readings available</td>
            </tr>
          ) : averages.map((item) => (
            <tr key={item.sensorType} className="border-t border-gray-800">
              <td className="px-4 py-3 text-gray-200">{item.sensorType}</td>
              <td className="px-4 py-3 text-green-300 font-medium">{item.average}</td>
              <td className="px-4 py-3 text-gray-400">{item.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AggregateReportPanel({ report, loading, error }) {
  if (loading) {
    return (
      <section className="card p-5">
        <div className="text-sm text-gray-400">Loading aggregated report...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="card p-5 border-red-800/50">
        <div className="text-sm text-red-400">{error}</div>
      </section>
    );
  }

  if (!report) return null;

  return (
    <section className="card p-5 space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-green-800/40 bg-green-900/20 p-3 text-green-300">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Aggregated Report</h2>
            <p className="text-sm text-gray-400">
              {report.scope.name} · {formatLevel(report.scope.level)} level averages
            </p>
          </div>
        </div>

        <button
          onClick={() => openPrintWindow(report)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-700"
        >
          <Printer className="w-4 h-4" />
          Print PDF Report
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-500">
            {report.scope.name}
          </h3>
        </div>
        <AverageTable averages={report.scope.averages} />
      </div>

      {report.childLevel && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-500">
            {formatLevel(report.childLevel)} Breakdown
          </h3>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {report.children.map((child) => (
              <div key={child.id} className="rounded-xl border border-gray-800 bg-gray-950/60 p-4 space-y-3">
                <div>
                  <div className="text-base font-semibold text-white">{child.name}</div>
                  <div className="text-xs uppercase tracking-[0.16em] text-gray-500">{formatLevel(child.level)}</div>
                </div>
                <AverageTable averages={child.averages} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
