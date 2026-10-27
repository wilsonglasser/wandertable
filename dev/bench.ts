import '../src/styles.css';
import { WanderTable } from 'wandertable';
import type { CellPatch } from 'wandertable';

const params = new URLSearchParams(location.search);
const rows = Number(params.get('rows') ?? 4513);
const cols = Number(params.get('cols') ?? 37);
const filled = Number(params.get('cells') ?? 60039);

const t0 = performance.now();
const table = new WanderTable(document.getElementById('grid')!, {
  mode: 'spreadsheet',
  layout: 'scroll',
  rowCount: rows,
  colCount: cols,
  defaultRowHeight: 28,
  defaultColWidth: 110,
  showRowHeaders: true,
  showColHeaders: true,
  allowRangeSelection: true,
  allowClipboard: true,
  allowUndoRedo: true,
  allowContextMenu: true,
});
const t1 = performance.now();
const patches: CellPatch[] = [];
let n = 0;
for (let r = 0; r < rows && n < filled; r++) {
  for (let c = 0; c < cols && n < filled; c++, n++) {
    patches.push({ row: r, col: c, data: { value: `Label ${r}-${c} texto de referência` } });
  }
}
const t2 = performance.now();
table.applyPatch(patches);
const t3 = performance.now();
requestAnimationFrame(() => requestAnimationFrame(() => {
  const t4 = performance.now();
  (window as any).__bench = {
    construct: t1 - t0, buildPatches: t2 - t1, applyPatch: t3 - t2, firstPaint: t4 - t3, total: t4 - t0,
    domNodes: document.getElementsByTagName('*').length,
  };
}));
(window as any).__table = table;
