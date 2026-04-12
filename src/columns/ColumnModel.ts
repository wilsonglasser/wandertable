import type { ColumnConfig } from '../types/index.js';

export class ColumnModel {
  private configs: ColumnConfig[];
  private widths: number[];
  private prefixSums: number[];
  private defaultWidth: number;

  constructor(colCount: number, defaultWidth: number, configs?: ColumnConfig[]) {
    this.defaultWidth = defaultWidth;
    this.configs = configs ?? [];
    this.widths = new Array(colCount);
    for (let i = 0; i < colCount; i++) {
      this.widths[i] = this.configs[i]?.width ?? defaultWidth;
    }
    this.prefixSums = this.buildPrefixSums();
  }

  private buildPrefixSums(): number[] {
    const sums = new Array(this.widths.length + 1);
    sums[0] = 0;
    for (let i = 0; i < this.widths.length; i++) {
      sums[i + 1] = sums[i] + this.widths[i];
    }
    return sums;
  }

  get count(): number {
    return this.widths.length;
  }

  getWidth(col: number): number {
    return this.widths[col] ?? this.defaultWidth;
  }

  setWidth(col: number, width: number): void {
    const cfg = this.configs[col];
    const min = cfg?.minWidth ?? 30;
    const max = cfg?.maxWidth ?? Infinity;
    this.widths[col] = Math.max(min, Math.min(max, width));
    this.prefixSums = this.buildPrefixSums();
  }

  getX(col: number): number {
    return this.prefixSums[col] ?? 0;
  }

  getTotalWidth(): number {
    return this.prefixSums[this.widths.length] ?? 0;
  }

  getConfig(col: number): ColumnConfig | undefined {
    return this.configs[col];
  }

  setCount(count: number): void {
    while (this.widths.length < count) {
      this.widths.push(this.defaultWidth);
    }
    this.widths.length = count;
    this.prefixSums = this.buildPrefixSums();
  }

  /** Find column at pixel X using binary search */
  getColAtX(x: number): number {
    let lo = 0;
    let hi = this.widths.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (this.prefixSums[mid + 1] <= x) {
        lo = mid + 1;
      } else if (this.prefixSums[mid] > x) {
        hi = mid - 1;
      } else {
        return mid;
      }
    }
    return Math.max(0, Math.min(lo, this.widths.length - 1));
  }

  static columnLabel(index: number): string {
    return columnLabel(index);
  }
}

/**
 * Convert a 0-based column index to a spreadsheet-style label.
 * 0 -> A, 1 -> B, ..., 25 -> Z, 26 -> AA, 27 -> AB, ..., 701 -> ZZ, 702 -> AAA
 */
export function columnLabel(index: number): string {
  let label = '';
  let i = index;
  while (i >= 0) {
    label = String.fromCharCode(65 + (i % 26)) + label;
    i = Math.floor(i / 26) - 1;
  }
  return label;
}
