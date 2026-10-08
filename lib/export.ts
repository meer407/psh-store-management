import type { ProductVariant } from '@/lib/types';

export function exportToCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row =>
      headers.map(h => {
        const val = row[h];
        const str = val === null || val === undefined ? '' : String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(',')
    ),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const LOGO_SVG = `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#1e40af"/></linearGradient></defs><rect width="48" height="48" rx="12" fill="url(#g)"/><path d="M12 16h24v4H12zm0 8h24v4H12zm0 8h16v4H12z" fill="white" opacity="0.9"/><circle cx="36" cy="32" r="5" fill="white" opacity="0.7"/></svg>`)}`;

interface PrintColumn {
  header: string;
  key: string;
  width?: string;
  align?: 'left' | 'right' | 'center';
}

interface PrintOptions {
  title: string;
  subtitle?: string;
  columns: PrintColumn[];
  rows: Record<string, string | number | null>[];
  meta?: { label: string; value: string }[];
  orientation?: 'portrait' | 'landscape';
}

export function printDocument(opts: PrintOptions) {
  const { title, subtitle, columns, rows, meta, orientation = 'portrait' } = opts;

  const buildTable = () => {
    const totalWidth = columns.reduce((sum, c) => sum + parseInt(c.width || 'auto'), 0);
    const tableWidth = totalWidth > 0 ? `${totalWidth}px` : '100%';

    return `
      <table style="width: ${tableWidth}; border-collapse: collapse; font-size: 11px; margin-top: 8px;">
        <thead>
          <tr>
            ${columns.map(c => `<th style="padding: 8px 10px; text-align: ${c.align || 'left'}; background: #1e40af; color: white; font-weight: 600; border: 1px solid #1e40af; ${c.width ? `width: ${c.width};` : ''}">${c.header}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, i) => `
            <tr style="${i % 2 === 0 ? '' : 'background: #f1f5f9;'}">
              ${columns.map(c => `<td style="padding: 6px 10px; text-align: ${c.align || 'left'}; border: 1px solid #e2e8f0; ${c.align === 'right' ? 'font-variant-numeric: tabular-nums;' : ''}">${row[c.key] ?? ''}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  };

  const buildMeta = () => {
    if (!meta || meta.length === 0) return '';
    return `
      <div style="display: flex; flex-wrap: wrap; gap: 24px; margin: 16px 0; padding: 12px 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
        ${meta.map(m => `
          <div>
            <p style="font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 2px 0;">${m.label}</p>
            <p style="font-size: 13px; font-weight: 600; color: #1e293b; margin: 0;">${m.value}</p>
          </div>
        `).join('')}
      </div>
    `;
  };

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    @page { size: A4 ${orientation}; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; color: #1e293b; margin: 0; padding: 0; }
    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1e40af; padding-bottom: 16px; margin-bottom: 20px; }
    .header-left { display: flex; align-items: center; gap: 14px; }
    .header-left img { width: 48px; height: 48px; }
    .header-left h1 { font-size: 20px; font-weight: 700; color: #1e40af; margin: 0; }
    .header-left p { font-size: 11px; color: #64748b; margin: 2px 0 0 0; }
    .header-right { text-align: right; }
    .header-right .doc-title { font-size: 16px; font-weight: 600; color: #1e293b; }
    .header-right .doc-date { font-size: 11px; color: #64748b; margin-top: 4px; }
    .subtitle { font-size: 12px; color: #475569; margin: 0 0 8px 0; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
    .signature { margin-top: 40px; display: flex; justify-content: space-between; }
    .signature div { text-align: center; }
    .signature .line { width: 180px; border-top: 1px solid #475569; margin-bottom: 4px; }
    .signature .label { font-size: 11px; color: #64748b; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <img src="${LOGO_SVG}" alt="Logo" />
      <div>
        <h1>PSH Store Management</h1>
        <p>Pakistan Sweet Home - Store Management System</p>
      </div>
    </div>
    <div class="header-right">
      <div class="doc-title">${title}</div>
      <div class="doc-date">Generated: ${new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}</div>
    </div>
  </div>
  ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
  ${buildMeta()}
  ${buildTable()}
  <div class="signature">
    <div><div class="line"></div><div class="label">Prepared By</div></div>
    <div><div class="line"></div><div class="label">Approved By</div></div>
  </div>
  <div class="footer">
    <span>PSH Store Management System</span>
    <span>Page 1 of 1</span>
  </div>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.print(); }, 300);
  }
}

// Legacy compatibility wrapper
export function printTable(title: string, headers: string[], rows: string[][]) {
  printDocument({
    title,
    columns: headers.map(h => ({ header: h, key: h })),
    rows: rows.map(r => {
      const obj: Record<string, string | number | null> = {};
      headers.forEach((h, i) => { obj[h] = r[i] ?? ''; });
      return obj;
    }),
  });
}
