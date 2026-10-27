import type { CellSource } from '../types/index.js';

export type SortDirection = 'asc' | 'desc' | null;

export interface SortState {
  col: number;
  direction: SortDirection;
  compareFn?: (a: unknown, b: unknown) => number;
}

export type FilterFn = (row: number, data: CellSource) => boolean;

/**
 * Maps visual row indices to actual data row indices.
 * Handles sorting and filtering without mutating the DataModel.
 */
export class ViewMapping {
  /** visualIndex -> dataIndex */
  private mapping: number[] = [];
  private identity = true;

  private sortState: SortState | null = null;
  private filters = new Map<number, FilterFn>();
  private data: CellSource;

  onChange: (() => void) | null = null;

  constructor(data: CellSource) {
    this.data = data;
    this.rebuild();
  }

  /** Total visible row count after filtering */
  get visibleRowCount(): number {
    return this.identity ? this.data.rowCount : this.mapping.length;
  }

  /** Translate visual row to data row */
  toDataRow(visualRow: number): number {
    if (this.identity) return visualRow;
    return this.mapping[visualRow] ?? visualRow;
  }

  /** Translate data row to visual row (or -1 if filtered out) */
  toVisualRow(dataRow: number): number {
    if (this.identity) return dataRow;
    const idx = this.mapping.indexOf(dataRow);
    return idx;
  }

  // ── Sorting ──

  sort(col: number, direction: SortDirection, compareFn?: (a: unknown, b: unknown) => number): void {
    if (direction === null) {
      this.sortState = null;
    } else {
      this.sortState = { col, direction, compareFn };
    }
    this.rebuild();
    this.onChange?.();
  }

  getSortState(): SortState | null {
    return this.sortState;
  }

  clearSort(): void {
    this.sortState = null;
    this.rebuild();
    this.onChange?.();
  }

  // ── Filtering ──

  setFilter(col: number, fn: FilterFn): void {
    this.filters.set(col, fn);
    this.rebuild();
    this.onChange?.();
  }

  removeFilter(col: number): void {
    this.filters.delete(col);
    this.rebuild();
    this.onChange?.();
  }

  clearFilters(): void {
    this.filters.clear();
    this.rebuild();
    this.onChange?.();
  }

  getActiveFilters(): number[] {
    return Array.from(this.filters.keys());
  }

  // ── Rebuild ──

  rebuild(): void {
    const hasSort = this.sortState !== null;
    const hasFilter = this.filters.size > 0;

    if (!hasSort && !hasFilter) {
      this.identity = true;
      this.mapping = [];
      return;
    }

    this.identity = false;

    // Start with all rows
    let rows: number[] = [];
    for (let i = 0; i < this.data.rowCount; i++) {
      rows.push(i);
    }

    // Apply filters
    if (hasFilter) {
      rows = rows.filter(row => {
        for (const fn of this.filters.values()) {
          if (!fn(row, this.data)) return false;
        }
        return true;
      });
    }

    // Apply sort
    if (hasSort && this.sortState) {
      const { col, direction, compareFn } = this.sortState;
      const dir = direction === 'desc' ? -1 : 1;

      rows.sort((a, b) => {
        const va = this.data.getCell(a, col)?.value;
        const vb = this.data.getCell(b, col)?.value;

        if (compareFn) {
          return compareFn(va, vb) * dir;
        }

        return defaultCompare(va, vb) * dir;
      });
    }

    this.mapping = rows;
  }
}

function defaultCompare(a: unknown, b: unknown): number {
  // Nulls/undefined last
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  // Numbers
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }

  // Booleans
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return (a === b) ? 0 : a ? -1 : 1;
  }

  // Strings (locale-aware)
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}
