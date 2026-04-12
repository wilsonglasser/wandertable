import type { RowConfig } from '../types/index.js';

export class RowModel {
  private heights: number[];
  private prefixSums: number[];
  private defaultHeight: number;
  private configs: Map<number, RowConfig> = new Map();

  constructor(rowCount: number, defaultHeight: number) {
    this.defaultHeight = defaultHeight;
    this.heights = new Array(rowCount).fill(defaultHeight);
    this.prefixSums = this.buildPrefixSums();
  }

  private buildPrefixSums(): number[] {
    const sums = new Array(this.heights.length + 1);
    sums[0] = 0;
    for (let i = 0; i < this.heights.length; i++) {
      sums[i + 1] = sums[i] + this.heights[i];
    }
    return sums;
  }

  get count(): number {
    return this.heights.length;
  }

  getHeight(row: number): number {
    return this.heights[row] ?? this.defaultHeight;
  }

  setHeight(row: number, height: number): void {
    const minH = 20;
    this.heights[row] = Math.max(minH, height);
    this.prefixSums = this.buildPrefixSums();
  }

  getY(row: number): number {
    return this.prefixSums[row] ?? 0;
  }

  getTotalHeight(): number {
    return this.prefixSums[this.heights.length] ?? 0;
  }

  getConfig(row: number): RowConfig | undefined {
    return this.configs.get(row);
  }

  setConfig(row: number, config: RowConfig): void {
    this.configs.set(row, config);
    if (config.height != null) {
      this.setHeight(row, config.height);
    }
  }

  setCount(count: number): void {
    while (this.heights.length < count) {
      this.heights.push(this.defaultHeight);
    }
    this.heights.length = count;
    this.prefixSums = this.buildPrefixSums();
  }

  /** Find row at pixel Y using binary search */
  getRowAtY(y: number): number {
    let lo = 0;
    let hi = this.heights.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (this.prefixSums[mid + 1] <= y) {
        lo = mid + 1;
      } else if (this.prefixSums[mid] > y) {
        hi = mid - 1;
      } else {
        return mid;
      }
    }
    return Math.max(0, Math.min(lo, this.heights.length - 1));
  }
}
