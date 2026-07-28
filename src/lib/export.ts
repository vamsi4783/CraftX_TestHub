import * as XLSX from 'xlsx';

// ── CSV ───────────────────────────────────────────────────────────────────────

export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(escape).join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
}

export function downloadCSV(rows: Record<string, unknown>[], filename: string) {
  const blob = new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

// ── Excel (XLSX) ──────────────────────────────────────────────────────────────

export function downloadExcel(sheets: Record<string, Record<string, unknown>[]>, filename: string) {
  const wb = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([sheetName, rows]) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    // Auto-width
    const colWidths = Object.keys(rows[0] ?? {}).map(k => ({
      wch: Math.min(50, Math.max(k.length + 2, ...rows.map(r => String(r[k] ?? '').length))),
    }));
    ws['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}

// ── Print / PDF ───────────────────────────────────────────────────────────────

export function printReport(title: string, htmlContent: string) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size: 12px; color: #111; padding: 32px; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { color: #6B7280; font-size: 11px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #F3F4F6; text-align: left; padding: 6px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 6px 10px; border-bottom: 1px solid #E5E7EB; }
    tr:last-child td { border-bottom: none; }
    .chip { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
    .critical { background: #EDE9FE; color: #5B21B6; }
    .high     { background: #FEE2E2; color: #991B1B; }
    .medium   { background: #FEF3C7; color: #92400E; }
    .low      { background: #D1FAE5; color: #065F46; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="meta">Generated on ${new Date().toLocaleString()}</p>
  ${htmlContent}
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`);
  win.document.close();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function rowsToHTMLTable(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '<p>No data</p>';
  const headers = Object.keys(rows[0]);
  const ths = headers.map(h => `<th>${h}</th>`).join('');
  const trs = rows.map(r =>
    `<tr>${headers.map(h => {
      const v = String(r[h] ?? '');
      const cls = ['critical','high','medium','low'].includes(v.toLowerCase()) ? ` class="chip ${v.toLowerCase()}"` : '';
      return `<td${cls ? '' : ''}>${cls ? `<span${cls}>${v}</span>` : v}</td>`;
    }).join('')}</tr>`
  ).join('');
  return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
}
