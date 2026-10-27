import type { CellRenderer, CellSource, CellState } from '../types/index.js';
import type { ColumnModel } from '../columns/ColumnModel.js';
import type { RowModel } from '../rows/RowModel.js';
import { columnLabel } from '../columns/ColumnModel.js';

const DEFAULT_STATE: CellState = { selected: false, focused: false, editing: false, hover: false };

export class AutoFit {
  private measureEl: HTMLElement;
  private data: CellSource;
  private columns: ColumnModel;
  private renderers: Map<string, CellRenderer>;
  private defaultRenderer: CellRenderer;

  constructor(
    container: HTMLElement,
    data: CellSource,
    columns: ColumnModel,
    _rows: RowModel,
    renderers: Map<string, CellRenderer>,
    defaultRenderer: CellRenderer,
  ) {
    this.data = data;
    this.columns = columns;
    this.renderers = renderers;
    this.defaultRenderer = defaultRenderer;

    // Offscreen measure element
    this.measureEl = document.createElement('div');
    this.measureEl.className = 'wt-cell';
    this.measureEl.style.position = 'absolute';
    this.measureEl.style.visibility = 'hidden';
    this.measureEl.style.left = '-9999px';
    this.measureEl.style.top = '-9999px';
    this.measureEl.style.whiteSpace = 'nowrap';
    this.measureEl.style.height = 'auto';
    this.measureEl.style.width = 'auto';
    container.appendChild(this.measureEl);
  }

  /** Measure a single cell's natural width and height */
  measureCell(row: number, col: number): { width: number; height: number } {
    const cellData = this.data.getCell(row, col);
    const type = cellData?.type ?? this.columns.getConfig(col)?.type ?? 'text';
    const renderer = this.renderers.get(type) ?? this.defaultRenderer;

    renderer.render(this.measureEl, cellData, DEFAULT_STATE);

    const width = this.measureEl.scrollWidth + 1; // +1 for rounding
    const height = this.measureEl.scrollHeight + 1;

    this.measureEl.textContent = '';
    this.measureEl.innerHTML = '';

    return { width, height };
  }

  /** Auto-fit a column width to its content. Samples up to `maxRows` rows. */
  autoFitColumn(col: number, maxRows = 500): number {
    const padding = 16; // cell padding
    let maxWidth = 40; // minimum

    // Measure header
    // (Header is simple text, just measure label length)
    const label = this.columns.getConfig(col)?.label ?? columnLabel(col);
    this.measureEl.textContent = label;
    this.measureEl.style.fontWeight = '500';
    maxWidth = Math.max(maxWidth, this.measureEl.scrollWidth + padding);
    this.measureEl.style.fontWeight = '';

    // Sample rows
    const totalRows = this.data.rowCount;
    const step = totalRows > maxRows ? Math.floor(totalRows / maxRows) : 1;

    for (let r = 0; r < totalRows; r += step) {
      if (!this.data.hasCell(r, col)) continue;
      const { width } = this.measureCell(r, col);
      maxWidth = Math.max(maxWidth, width + padding);
    }

    const cfg = this.columns.getConfig(col);
    const min = cfg?.minWidth ?? 30;
    const max = cfg?.maxWidth ?? 600;

    return Math.max(min, Math.min(max, maxWidth));
  }

  /** Auto-fit a row height to its content */
  autoFitRow(row: number): number {
    let maxHeight = 20; // minimum

    for (let c = 0; c < this.columns.count; c++) {
      if (!this.data.hasCell(row, c)) continue;

      // Set width constraint for wrapping
      this.measureEl.style.width = `${this.columns.getWidth(c)}px`;
      this.measureEl.style.whiteSpace = 'normal';

      const { height } = this.measureCell(row, c);
      maxHeight = Math.max(maxHeight, height);

      this.measureEl.style.width = 'auto';
      this.measureEl.style.whiteSpace = 'nowrap';
    }

    return maxHeight;
  }

  destroy(): void {
    this.measureEl.remove();
  }
}
