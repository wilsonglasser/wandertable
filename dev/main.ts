import '../src/styles.css';
import { WanderTable, columnLabel, THEME_DARK, THEME_MINIMAL } from 'wandertable';
import type { CellPatch } from 'wandertable';

const container = document.getElementById('grid')!;
const logEl = document.getElementById('log')!;
const selEl = document.getElementById('selection-info')!;

function log(event: string, data?: string) {
  const entry = document.createElement('div');
  entry.className = 'entry';
  entry.innerHTML = `<span class="event">${event}</span>${data ? ` <span class="data">${data}</span>` : ''}`;
  logEl.prepend(entry);
  while (logEl.children.length > 50) logEl.lastChild?.remove();
}

// ════════════════════════════════════════
//  Excel-like spreadsheet mode
// ════════════════════════════════════════
const table = new WanderTable(container, {
  mode: 'spreadsheet',
  layout: 'auto',
  infinite: true,
  rowCount: 50,
  colCount: 26, // A-Z
  defaultRowHeight: 28,
  defaultColWidth: 100,
  autoRowHeight: true,
  showRowHeaders: true,
  showColHeaders: true,
  frozenRows: 0,
  frozenCols: 0,
  allowColResize: true,
  allowRowResize: true,
  allowRangeSelection: true,
  allowClipboard: true,
  allowUndoRedo: true,
  allowContextMenu: true,
});

// Some sample data scattered around like a real spreadsheet
const patches: CellPatch[] = [
  // Header-like row
  { row: 0, col: 0, data: { value: 'Item', style: { fontWeight: 'bold', bgColor: '#f1f5f9' } } },
  { row: 0, col: 1, data: { value: 'Qty', style: { fontWeight: 'bold', bgColor: '#f1f5f9', textAlign: 'center' } } },
  { row: 0, col: 2, data: { value: 'Price', style: { fontWeight: 'bold', bgColor: '#f1f5f9', textAlign: 'right' } } },
  { row: 0, col: 3, data: { value: 'Total', style: { fontWeight: 'bold', bgColor: '#f1f5f9', textAlign: 'right' } } },
  { row: 0, col: 4, data: { value: 'Status', style: { fontWeight: 'bold', bgColor: '#f1f5f9', textAlign: 'center' } } },

  // Data
  { row: 1, col: 0, data: { value: 'Laptop Pro 16"' } },
  { row: 1, col: 1, data: { value: 3, style: { textAlign: 'center' } } },
  { row: 1, col: 2, data: { value: 2499.00, style: { textAlign: 'right' } } },
  { row: 1, col: 3, data: { value: 7497.00, style: { textAlign: 'right', bgColor: '#f0fdf4' } } },
  { row: 1, col: 4, data: { value: 'active', type: 'badge' } },

  { row: 2, col: 0, data: { value: 'Monitor 4K 27"' } },
  { row: 2, col: 1, data: { value: 5, style: { textAlign: 'center' } } },
  { row: 2, col: 2, data: { value: 899.00, style: { textAlign: 'right' } } },
  { row: 2, col: 3, data: { value: 4495.00, style: { textAlign: 'right', bgColor: '#f0fdf4' } } },
  { row: 2, col: 4, data: { value: 'active', type: 'badge' } },

  { row: 3, col: 0, data: { value: 'Keyboard Mechanical' } },
  { row: 3, col: 1, data: { value: 10, style: { textAlign: 'center' } } },
  { row: 3, col: 2, data: { value: 179.00, style: { textAlign: 'right' } } },
  { row: 3, col: 3, data: { value: 1790.00, style: { textAlign: 'right', bgColor: '#f0fdf4' } } },
  { row: 3, col: 4, data: { value: 'pending', type: 'badge' } },

  { row: 4, col: 0, data: { value: 'Mouse Wireless' } },
  { row: 4, col: 1, data: { value: 15, style: { textAlign: 'center' } } },
  { row: 4, col: 2, data: { value: 79.00, style: { textAlign: 'right' } } },
  { row: 4, col: 3, data: { value: 1185.00, style: { textAlign: 'right', bgColor: '#f0fdf4' } } },
  { row: 4, col: 4, data: { value: 'inactive', type: 'badge' } },

  { row: 5, col: 0, data: { value: 'USB-C Hub' } },
  { row: 5, col: 1, data: { value: 8, style: { textAlign: 'center' } } },
  { row: 5, col: 2, data: { value: 49.00, style: { textAlign: 'right' } } },
  { row: 5, col: 3, data: { value: 392.00, style: { textAlign: 'right', bgColor: '#f0fdf4' } } },
  { row: 5, col: 4, data: { value: 'active', type: 'badge' } },

  // Empty row 6, then a summary
  { row: 7, col: 2, data: { value: 'Subtotal:', style: { fontWeight: 'bold', textAlign: 'right' } } },
  { row: 7, col: 3, data: { value: 15359.00, style: { fontWeight: 'bold', textAlign: 'right', bgColor: '#dbeafe' } } },

  // Somewhere else in the sheet - independent data
  { row: 0, col: 7, data: { value: 'Notes', style: { fontWeight: 'bold', bgColor: '#fef9c3' } } },
  { row: 1, col: 7, data: { value: 'Q4 order for new office setup' } },
  { row: 2, col: 7, data: { value: 'Delivery expected Jan 15' } },
  { row: 3, col: 7, data: { value: 'Bulk discount applied (-12%)' } },

  // A checkbox list somewhere else
  { row: 0, col: 10, data: { value: 'Task', style: { fontWeight: 'bold', bgColor: '#f1f5f9' } } },
  { row: 0, col: 11, data: { value: 'Done', style: { fontWeight: 'bold', bgColor: '#f1f5f9', textAlign: 'center' } } },
  { row: 1, col: 10, data: { value: 'Review quotes' } },
  { row: 1, col: 11, data: { value: true, type: 'checkbox' } },
  { row: 2, col: 10, data: { value: 'Approve budget' } },
  { row: 2, col: 11, data: { value: true, type: 'checkbox' } },
  { row: 3, col: 10, data: { value: 'Place order' } },
  { row: 3, col: 11, data: { value: false, type: 'checkbox' } },
  { row: 4, col: 10, data: { value: 'Schedule delivery' } },
  { row: 4, col: 11, data: { value: false, type: 'checkbox' } },

  // Progress somewhere
  { row: 10, col: 0, data: { value: 'Project Progress', style: { fontWeight: 'bold' } } },
  { row: 11, col: 0, data: { value: 'Backend API' } },
  { row: 11, col: 1, data: { value: 85, type: 'progress' } },
  { row: 12, col: 0, data: { value: 'Frontend UI' } },
  { row: 12, col: 1, data: { value: 60, type: 'progress' } },
  { row: 13, col: 0, data: { value: 'Documentation' } },
  { row: 13, col: 1, data: { value: 25, type: 'progress' } },

  // Cells with colored borders
  { row: 16, col: 0, data: { value: 'High priority', style: { borderLeft: '3px solid #ef4444' } } },
  { row: 17, col: 0, data: { value: 'Medium priority', style: { borderLeft: '3px solid #f59e0b' } } },
  { row: 18, col: 0, data: { value: 'Low priority', style: { borderLeft: '3px solid #22c55e' } } },
];

table.applyPatch(patches);

// Merge the "Notes" header across 2 cols
table.mergeCells(0, 7, 1, 2);

// Widen some columns
table.setColumnWidth(0, 160);
table.setColumnWidth(3, 110);
table.setColumnWidth(7, 240);
table.setColumnWidth(10, 160);

// ── Events ──
table.on('cell:change', (e) => {
  log('cell:change', `${columnLabel(e.col)}${e.row + 1}: "${e.oldValue}" -> "${e.newValue}"`);
});

table.on('command:execute', (e) => {
  log('command', `${e.changes.length} change(s)`);
});

table.on('command:undo', (e) => {
  log('undo', `restored ${e.changes.length} change(s)`);
});

table.on('selection:change', () => {
  const info = table.getSelectionInfo();
  if (info.isEmpty) { selEl.textContent = 'Ready'; return; }
  const parts: string[] = [];
  if (info.focus) parts.push(`${columnLabel(info.focus.col)}${info.focus.row + 1}`);
  if (info.isMultiCell && info.bounds) {
    const b = info.bounds;
    parts.push(`${columnLabel(b.startCol)}${b.startRow + 1}:${columnLabel(b.endCol)}${b.endRow + 1}`);
    parts.push(`${info.cellCount} cells`);
  }
  if (info.isFullRow) parts.push('Row');
  if (info.isFullCol) parts.push('Col');
  selEl.textContent = parts.join(' | ');
});

log('ready', `Spreadsheet mode | 1000 rows x 26 cols (A-Z) | Type anywhere, right-click for menu`);

// ── Controls ──
(window as any).undoAction = () => { table.undo(); };
(window as any).redoAction = () => { table.redo(); };
(window as any).exportCSV = () => {
  table.downloadCSV('spreadsheet.csv');
  log('export', 'CSV');
};

let currentTheme = 'light';
(window as any).toggleTheme = () => {
  const themes = ['light', 'dark', 'minimal'] as const;
  const themeMap = { light: null, dark: THEME_DARK, minimal: THEME_MINIMAL };
  const idx = themes.indexOf(currentTheme as any);
  currentTheme = themes[(idx + 1) % themes.length];
  const t = themeMap[currentTheme as keyof typeof themeMap];
  if (t) {
    const s = container.style;
    Object.entries(t).forEach(([k, v]) => {
      const cssVar = '--wt-' + k.replace(/([A-Z])/g, '-$1').toLowerCase();
      s.setProperty(cssVar, String(v));
    });
  } else {
    container.removeAttribute('style');
  }
  log('theme', currentTheme);
};

(window as any).clearAll = () => {
  table.data.clear();
  table.commands.clear();
  table.refresh();
  log('clear', 'done');
};
