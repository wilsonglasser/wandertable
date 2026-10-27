import type { CellData, CellKey, CellPatch, CellSource } from '../types/index.js';

/** Column stride of the numeric cell index: row * COL_STRIDE + col. */
const COL_STRIDE = 65536;

export class DataModel implements CellSource {
  /** Keyed by row * COL_STRIDE + col, so reads allocate nothing. */
  private cells = new Map<number, CellData>();
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

  private index(row: number, col: number): number {
    return row * COL_STRIDE + col;
  }

  private dirtyKey(row: number, col: number): CellKey {
    return `${row}:${col}`;
  }

  getCell(row: number, col: number): CellData | undefined {
    return this.cells.get(this.index(row, col));
  }

  setCell(row: number, col: number, data: CellData): void {
    this.cells.set(this.index(row, col), data);
    this.markDirty(this.dirtyKey(row, col));
  }

  setCellValue(row: number, col: number, value: unknown): void {
    const i = this.index(row, col);
    const existing = this.cells.get(i);
    if (existing) {
      existing.value = value;
    } else {
      this.cells.set(i, { value });
    }
    this.markDirty(this.dirtyKey(row, col));
  }

  deleteCell(row: number, col: number): void {
    this.cells.delete(this.index(row, col));
    this.markDirty(this.dirtyKey(row, col));
  }

  hasCell(row: number, col: number): boolean {
    return this.cells.has(this.index(row, col));
  }

  applyPatch(patches: CellPatch[]): void {
    this.transaction(() => {
      for (const p of patches) {
        const i = this.index(p.row, p.col);
        const existing = this.cells.get(i);
        if (existing) {
          Object.assign(existing, p.data);
        } else {
          this.cells.set(i, { value: undefined, ...p.data });
        }
        this._dirtyKeys.add(this.dirtyKey(p.row, p.col));
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
    for (const [i, data] of this.cells) {
      fn(Math.floor(i / COL_STRIDE), i % COL_STRIDE, data);
    }
  }
}
