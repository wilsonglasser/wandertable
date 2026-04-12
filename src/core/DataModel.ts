import type { CellData, CellKey, CellPatch } from '../types/index.js';

export class DataModel {
  private cells = new Map<CellKey, CellData>();
  private _rowCount: number;
  private _colCount: number;
  private _inTransaction = false;
  private _dirtyKeys = new Set<CellKey>();

  // Callback set by WanderTable to trigger re-render
  onChange: ((dirty: Set<CellKey>) => void) | null = null;

  constructor(rowCount: number, colCount: number) {
    this._rowCount = rowCount;
    this._colCount = colCount;
  }

  get rowCount(): number { return this._rowCount; }
  set rowCount(v: number) { this._rowCount = v; }

  get colCount(): number { return this._colCount; }
  set colCount(v: number) { this._colCount = v; }

  private key(row: number, col: number): CellKey {
    return `${row}:${col}`;
  }

  getCell(row: number, col: number): CellData | undefined {
    return this.cells.get(this.key(row, col));
  }

  setCell(row: number, col: number, data: CellData): void {
    const k = this.key(row, col);
    this.cells.set(k, data);
    this.markDirty(k);
  }

  setCellValue(row: number, col: number, value: unknown): void {
    const k = this.key(row, col);
    const existing = this.cells.get(k);
    if (existing) {
      existing.value = value;
    } else {
      this.cells.set(k, { value });
    }
    this.markDirty(k);
  }

  deleteCell(row: number, col: number): void {
    const k = this.key(row, col);
    this.cells.delete(k);
    this.markDirty(k);
  }

  hasCell(row: number, col: number): boolean {
    return this.cells.has(this.key(row, col));
  }

  applyPatch(patches: CellPatch[]): void {
    this.transaction(() => {
      for (const p of patches) {
        const k = this.key(p.row, p.col);
        const existing = this.cells.get(k);
        if (existing) {
          Object.assign(existing, p.data);
        } else {
          this.cells.set(k, { value: undefined, ...p.data });
        }
        this._dirtyKeys.add(k);
      }
    });
  }

  transaction(fn: () => void): void {
    if (this._inTransaction) {
      fn();
      return;
    }
    this._inTransaction = true;
    this._dirtyKeys.clear();
    try {
      fn();
    } finally {
      this._inTransaction = false;
      if (this._dirtyKeys.size > 0) {
        this.onChange?.(new Set(this._dirtyKeys));
        this._dirtyKeys.clear();
      }
    }
  }

  private markDirty(k: CellKey): void {
    if (this._inTransaction) {
      this._dirtyKeys.add(k);
    } else {
      this.onChange?.(new Set([k]));
    }
  }

  clear(): void {
    this.cells.clear();
    this.onChange?.(new Set());
  }

  /** Iterate all cells that have data */
  forEach(fn: (row: number, col: number, data: CellData) => void): void {
    for (const [key, data] of this.cells) {
      const [r, c] = key.split(':').map(Number);
      fn(r, c, data);
    }
  }
}
