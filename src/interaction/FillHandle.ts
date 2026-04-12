import type { CellPatch, SelectionRange } from '../types/index.js';
import type { DataModel } from '../core/DataModel.js';
import type { SelectionModel } from '../core/SelectionModel.js';
import type { ColumnModel } from '../columns/ColumnModel.js';
import type { RowModel } from '../rows/RowModel.js';

export type FillDirection = 'down' | 'up' | 'right' | 'left' | 'diagonal';

export type FillCallback = (
  source: SelectionRange,
  fill: SelectionRange,
  direction: FillDirection,
) => CellPatch[] | boolean | void;

export class FillHandle {
  private handleEl: HTMLElement;
  private shadowEl: HTMLElement;
  private dragging = false;
  private currentRow = -1;
  private currentCol = -1;
  private data: DataModel;
  private selection: SelectionModel;

  getCellAtPoint: ((x: number, y: number) => { row: number; col: number } | null) | null = null;
  getCellBounds: ((row: number, col: number) => { x: number; y: number; width: number; height: number }) | null = null;
  onFill: ((patches: CellPatch[], source: SelectionRange, fill: SelectionRange, direction: FillDirection) => void) | null = null;
  onFillCallback: FillCallback | null = null;
  enabled = true;

  constructor(
    container: HTMLElement,
    data: DataModel,
    selection: SelectionModel,
    _columns: ColumnModel,
    _rows: RowModel,
  ) {
    this.data = data;
    this.selection = selection;

    // Handle dot
    this.handleEl = document.createElement('div');
    this.handleEl.className = 'wt-fill-handle';
    this.handleEl.style.display = 'none';
    container.appendChild(this.handleEl);

    // Shadow preview overlay
    this.shadowEl = document.createElement('div');
    this.shadowEl.className = 'wt-fill-shadow';
    this.shadowEl.style.display = 'none';
    container.appendChild(this.shadowEl);

    this.handleEl.addEventListener('mousedown', this.onMouseDown);
  }

  updatePosition(): void {
    const bounds = this.selection.getBounds();
    if (!this.enabled || !bounds || !this.getCellBounds) {
      this.handleEl.style.display = 'none';
      return;
    }

    const lastCell = this.getCellBounds(bounds.r2, bounds.c2);
    this.handleEl.style.display = '';
    this.handleEl.style.left = `${lastCell.x + lastCell.width - 4}px`;
    this.handleEl.style.top = `${lastCell.y + lastCell.height - 4}px`;
  }

  private onMouseDown = (e: MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();

    const bounds = this.selection.getBounds();
    if (!bounds) return;

    this.dragging = true;
    this.currentRow = bounds.r2;
    this.currentCol = bounds.c2;

    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
    document.body.style.cursor = 'crosshair';
    document.body.style.userSelect = 'none';
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.dragging || !this.getCellAtPoint) return;
    const cell = this.getCellAtPoint(e.clientX, e.clientY);
    if (cell) {
      this.currentRow = cell.row;
      this.currentCol = cell.col;
      this.updateShadow();
    }
  };

  private updateShadow(): void {
    const bounds = this.selection.getBounds();
    if (!bounds || !this.getCellBounds) {
      this.shadowEl.style.display = 'none';
      return;
    }

    const { r1, c1, r2, c2 } = bounds;
    const cr = this.currentRow;
    const cc = this.currentCol;

    // If still inside the selection, hide shadow
    if (cr >= r1 && cr <= r2 && cc >= c1 && cc <= c2) {
      this.shadowEl.style.display = 'none';
      // Reset handle to original position
      this.updatePosition();
      return;
    }

    // Compute the full fill area (source + fill combined)
    const minR = Math.min(r1, cr);
    const maxR = Math.max(r2, cr);
    const minC = Math.min(c1, cc);
    const maxC = Math.max(c2, cc);

    const topLeft = this.getCellBounds(minR, minC);
    const bottomRight = this.getCellBounds(maxR, maxC);

    const sx = topLeft.x;
    const sy = topLeft.y;
    const sw = bottomRight.x + bottomRight.width - sx;
    const sh = bottomRight.y + bottomRight.height - sy;

    // Show shadow over the FILL area only (exclude source)
    // We show the full expanded area as the shadow, the source is already highlighted by selection
    this.shadowEl.style.display = '';
    this.shadowEl.style.left = `${sx}px`;
    this.shadowEl.style.top = `${sy}px`;
    this.shadowEl.style.width = `${sw}px`;
    this.shadowEl.style.height = `${sh}px`;

    // Move the handle dot to the current drag position
    const curCell = this.getCellBounds(cr, cc);
    this.handleEl.style.left = `${curCell.x + curCell.width - 4}px`;
    this.handleEl.style.top = `${curCell.y + curCell.height - 4}px`;
  }

  private onMouseUp = (): void => {
    if (!this.dragging) return;
    this.dragging = false;
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    // Hide shadow
    this.shadowEl.style.display = 'none';

    this.executeFill();

    // Reset handle to selection corner
    this.updatePosition();
  };

  private executeFill(): void {
    const bounds = this.selection.getBounds();
    if (!bounds) return;

    const { r1, c1, r2, c2 } = bounds;
    const cr = this.currentRow;
    const cc = this.currentCol;

    // If still inside selection, nothing to fill
    if (cr >= r1 && cr <= r2 && cc >= c1 && cc <= c2) return;

    // Determine direction
    const dRow = cr > r2 ? cr - r2 : cr < r1 ? r1 - cr : 0;
    const dCol = cc > c2 ? cc - c2 : cc < c1 ? c1 - cc : 0;

    let direction: FillDirection;
    let fillRange: SelectionRange;

    if (dRow > 0 && dCol > 0) {
      // Diagonal: fill the full expanded rectangle minus the source
      direction = 'diagonal';
      fillRange = {
        startRow: Math.min(r1, cr),
        startCol: Math.min(c1, cc),
        endRow: Math.max(r2, cr),
        endCol: Math.max(c2, cc),
      };
    } else if (dRow > 0 && dCol === 0) {
      // Expand rows only
      if (cr > r2) {
        direction = 'down';
        fillRange = { startRow: r2 + 1, startCol: c1, endRow: cr, endCol: c2 };
      } else {
        direction = 'up';
        fillRange = { startRow: cr, startCol: c1, endRow: r1 - 1, endCol: c2 };
      }
    } else if (dCol > 0 && dRow === 0) {
      if (cc > c2) {
        direction = 'right';
        fillRange = { startRow: r1, startCol: c2 + 1, endRow: r2, endCol: cc };
      } else {
        direction = 'left';
        fillRange = { startRow: r1, startCol: cc, endRow: r2, endCol: c1 - 1 };
      }
    } else {
      // Mixed: treat as diagonal
      direction = 'diagonal';
      fillRange = {
        startRow: Math.min(r1, cr),
        startCol: Math.min(c1, cc),
        endRow: Math.max(r2, cr),
        endCol: Math.max(c2, cc),
      };
    }

    const sourceRange: SelectionRange = { startRow: r1, startCol: c1, endRow: r2, endCol: c2 };

    // External callback
    if (this.onFillCallback) {
      const result = this.onFillCallback(sourceRange, fillRange, direction);
      if (result === true) return;
      if (Array.isArray(result)) {
        this.onFill?.(result, sourceRange, fillRange, direction);
        return;
      }
    }

    const patches = this.defaultFill(sourceRange, fillRange, direction);
    this.onFill?.(patches, sourceRange, fillRange, direction);
  }

  private defaultFill(
    source: SelectionRange,
    fill: SelectionRange,
    _direction: FillDirection,
  ): CellPatch[] {
    const patches: CellPatch[] = [];
    const srcRows = source.endRow - source.startRow + 1;
    const srcCols = source.endCol - source.startCol + 1;

    for (let r = fill.startRow; r <= fill.endRow; r++) {
      for (let c = fill.startCol; c <= fill.endCol; c++) {
        // Skip cells that are inside the source range
        if (r >= source.startRow && r <= source.endRow &&
            c >= source.startCol && c <= source.endCol) {
          continue;
        }

        // Map to source cell using modulo wrapping
        const srcRow = source.startRow + (((r - source.startRow) % srcRows) + srcRows) % srcRows;
        const srcCol = source.startCol + (((c - source.startCol) % srcCols) + srcCols) % srcCols;
        const srcCell = this.data.getCell(srcRow, srcCol);

        patches.push({
          row: r,
          col: c,
          data: { value: srcCell?.value },
        });
      }
    }

    return patches;
  }

  destroy(): void {
    this.handleEl.remove();
    this.shadowEl.remove();
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
  }
}
