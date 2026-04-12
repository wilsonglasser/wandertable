import type { CellAddress, SelectionInfo, SelectionRange } from '../types/index.js';

export class SelectionModel {
  private _focus: CellAddress | null = null;
  private _ranges: SelectionRange[] = [];
  private _rowCount: number;
  private _colCount: number;

  onChange: (() => void) | null = null;

  constructor(rowCount: number, colCount: number) {
    this._rowCount = rowCount;
    this._colCount = colCount;
  }

  get focus(): CellAddress | null {
    return this._focus;
  }

  get ranges(): SelectionRange[] {
    return this._ranges;
  }

  setDimensions(rowCount: number, colCount: number): void {
    this._rowCount = rowCount;
    this._colCount = colCount;
  }

  /** Set focus and single selection */
  focusCell(row: number, col: number): void {
    row = this.clampRow(row);
    col = this.clampCol(col);
    this._focus = { row, col };
    this._ranges = [{ startRow: row, startCol: col, endRow: row, endCol: col }];
    this.onChange?.();
  }

  /** Extend selection from focus to target */
  extendTo(row: number, col: number): void {
    if (!this._focus) return;
    row = this.clampRow(row);
    col = this.clampCol(col);
    this._ranges = [{
      startRow: this._focus.row,
      startCol: this._focus.col,
      endRow: row,
      endCol: col,
    }];
    this.onChange?.();
  }

  /** Add a new range (Ctrl+Click) */
  addRange(range: SelectionRange): void {
    this._ranges.push(range);
    this._focus = { row: range.startRow, col: range.startCol };
    this.onChange?.();
  }

  /** Select entire column */
  selectColumn(col: number): void {
    this._focus = { row: 0, col };
    this._ranges = [{
      startRow: 0, startCol: col,
      endRow: Infinity, endCol: col,
    }];
    this.onChange?.();
  }

  /** Select entire row */
  selectRow(row: number): void {
    this._focus = { row, col: 0 };
    this._ranges = [{
      startRow: row, startCol: 0,
      endRow: row, endCol: Infinity,
    }];
    this.onChange?.();
  }

  /** Select all */
  selectAll(): void {
    this._focus = { row: 0, col: 0 };
    this._ranges = [{
      startRow: 0, startCol: 0,
      endRow: Infinity, endCol: Infinity,
    }];
    this.onChange?.();
  }

  /** Check if a cell is within any selected range */
  isSelected(row: number, col: number): boolean {
    return this._ranges.some(r => this.inRange(row, col, r));
  }

  isFocused(row: number, col: number): boolean {
    return this._focus?.row === row && this._focus?.col === col;
  }

  /** Iterate all selected cells (clamped to actual dimensions) */
  forEachSelected(fn: (row: number, col: number) => void): void {
    for (const r of this._ranges) {
      const r1 = Math.min(r.startRow, r.endRow);
      const r2 = Math.min(Math.max(r.startRow, r.endRow), this._rowCount - 1);
      const c1 = Math.min(r.startCol, r.endCol);
      const c2 = Math.min(Math.max(r.startCol, r.endCol), this._colCount - 1);
      for (let row = r1; row <= r2; row++) {
        for (let col = c1; col <= c2; col++) {
          fn(row, col);
        }
      }
    }
  }

  /** Get the bounding box of the current selection (clamped to actual dimensions) */
  getBounds(): { r1: number; c1: number; r2: number; c2: number } | null {
    if (this._ranges.length === 0) return null;
    let r1 = Infinity, c1 = Infinity, r2 = -Infinity, c2 = -Infinity;
    for (const r of this._ranges) {
      r1 = Math.min(r1, r.startRow, r.endRow);
      c1 = Math.min(c1, r.startCol, r.endCol);
      r2 = Math.max(r2, r.startRow, r.endRow);
      c2 = Math.max(c2, r.startCol, r.endCol);
    }
    // Clamp Infinity to actual dimensions
    r2 = Math.min(r2, this._rowCount - 1);
    c2 = Math.min(c2, this._colCount - 1);
    return { r1, c1, r2, c2 };
  }

  /** Get rich selection info */
  getInfo(): SelectionInfo {
    const bounds = this.getBounds();
    let cellCount = 0;
    this.forEachSelected(() => { cellCount++; });

    const startRow = bounds?.r1 ?? 0;
    const startCol = bounds?.c1 ?? 0;
    const endRow = bounds?.r2 ?? 0;
    const endCol = bounds?.c2 ?? 0;

    // Check raw ranges for Infinity to detect full row/col selections
    const hasInfRow = this._ranges.some(r => r.endRow === Infinity || r.startRow === Infinity);
    const hasInfCol = this._ranges.some(r => r.endCol === Infinity || r.startCol === Infinity);
    const isFullRow = bounds !== null && (hasInfCol || (startCol === 0 && endCol === this._colCount - 1));
    const isFullCol = bounds !== null && (hasInfRow || (startRow === 0 && endRow === this._rowCount - 1));

    return {
      focus: this._focus ? { ...this._focus } : null,
      ranges: this._ranges.map(r => ({ ...r })),
      bounds: bounds ? { startRow, startCol, endRow, endCol } : null,
      cellCount,
      rangeCount: this._ranges.length,
      isMultiCell: cellCount > 1,
      isFullRow,
      isFullCol,
      isAll: isFullRow && isFullCol,
      isEmpty: this._ranges.length === 0,
      rowSpan: bounds ? endRow - startRow + 1 : 0,
      colSpan: bounds ? endCol - startCol + 1 : 0,
    };
  }

  clear(): void {
    this._focus = null;
    this._ranges = [];
    this.onChange?.();
  }

  /** Move focus in a direction */
  move(dRow: number, dCol: number, extend: boolean): void {
    if (!this._focus) {
      this.focusCell(0, 0);
      return;
    }
    const newRow = this.clampRow(this._focus.row + dRow);
    const newCol = this.clampCol(this._focus.col + dCol);
    if (extend) {
      this.extendTo(newRow, newCol);
    } else {
      this.focusCell(newRow, newCol);
    }
  }

  private inRange(row: number, col: number, r: SelectionRange): boolean {
    const r1 = Math.min(r.startRow, r.endRow);
    const r2 = Math.max(r.startRow, r.endRow);
    const c1 = Math.min(r.startCol, r.endCol);
    const c2 = Math.max(r.startCol, r.endCol);
    return row >= r1 && row <= r2 && col >= c1 && col <= c2;
  }

  /** When true, navigation beyond bounds is allowed (grid will expand) */
  infinite = false;

  private clampRow(row: number): number {
    if (this.infinite) return Math.max(0, row);
    return Math.max(0, Math.min(this._rowCount - 1, row));
  }

  private clampCol(col: number): number {
    if (this.infinite) return Math.max(0, col);
    return Math.max(0, Math.min(this._colCount - 1, col));
  }
}
