import type { DataModel } from '../core/DataModel.js';
import type { ViewMapping } from '../core/ViewMapping.js';
import { columnLabel } from '../columns/ColumnModel.js';

export interface ExportOptions {
  /** Export only visible (filtered/sorted) rows. Default: true */
  visibleOnly?: boolean;
  /** Columns to include (by index). Default: all */
  columns?: number[];
  /** Include header row with column labels. Default: true */
  includeHeaders?: boolean;
  /** Column labels (if includeHeaders). Falls back to A, B, C... */
  headers?: string[];
}

export function exportCSV(
  data: DataModel,
  viewMapping: ViewMapping,
  options: ExportOptions = {},
): string {
  const {
    visibleOnly = true,
    columns,
    includeHeaders = true,
    headers,
  } = options;

  const colIndices = columns ?? Array.from({ length: data.colCount }, (_, i) => i);
  const lines: string[] = [];

  if (includeHeaders) {
    const headerRow = colIndices.map((c, i) => {
      const label = headers?.[i] ?? columnLabel(c);
      return csvEscape(label);
    });
    lines.push(headerRow.join(','));
  }

  const rowCount = visibleOnly ? viewMapping.visibleRowCount : data.rowCount;

  for (let vr = 0; vr < rowCount; vr++) {
    const dr = visibleOnly ? viewMapping.toDataRow(vr) : vr;
    const row = colIndices.map(col => {
      const cell = data.getCell(dr, col);
      const val = cell?.value;
      return csvEscape(val != null ? String(val) : '');
    });
    lines.push(row.join(','));
  }

  return lines.join('\n');
}

export function exportJSON(
  data: DataModel,
  viewMapping: ViewMapping,
  options: ExportOptions = {},
): object[] {
  const {
    visibleOnly = true,
    columns,
    headers,
  } = options;

  const colIndices = columns ?? Array.from({ length: data.colCount }, (_, i) => i);
  const rowCount = visibleOnly ? viewMapping.visibleRowCount : data.rowCount;
  const result: object[] = [];

  for (let vr = 0; vr < rowCount; vr++) {
    const dr = visibleOnly ? viewMapping.toDataRow(vr) : vr;
    const row: Record<string, unknown> = {};
    for (let ci = 0; ci < colIndices.length; ci++) {
      const col = colIndices[ci];
      const key = headers?.[ci] ?? columnLabel(col);
      const cell = data.getCell(dr, col);
      row[key] = cell?.value ?? null;
    }
    result.push(row);
  }

  return result;
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
