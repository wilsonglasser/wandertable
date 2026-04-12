import type { PaginationConfig, PaginationState } from '../types/index.js';

export class PaginationModel {
  private _page: number;
  private _pageSize: number;
  private _totalRows: number;
  enabled: boolean;

  onChange: ((state: PaginationState) => void) | null = null;

  constructor(config?: PaginationConfig) {
    this.enabled = config?.enabled ?? false;
    this._pageSize = config?.pageSize ?? 50;
    this._page = config?.page ?? 0;
    this._totalRows = config?.totalRows ?? 0;
  }

  get page(): number { return this._page; }
  get pageSize(): number { return this._pageSize; }
  get totalRows(): number { return this._totalRows; }

  get totalPages(): number {
    if (this._totalRows === 0) return 0;
    return Math.ceil(this._totalRows / this._pageSize);
  }

  get startRow(): number {
    return this._page * this._pageSize;
  }

  get endRow(): number {
    return Math.min(this.startRow + this._pageSize, this._totalRows);
  }

  getState(): PaginationState {
    return {
      page: this._page,
      pageSize: this._pageSize,
      totalRows: this._totalRows,
      totalPages: this.totalPages,
      startRow: this.startRow,
      endRow: this.endRow,
    };
  }

  setPage(page: number): void {
    const clamped = Math.max(0, Math.min(page, this.totalPages - 1));
    if (clamped === this._page) return;
    this._page = clamped;
    this.onChange?.(this.getState());
  }

  setPageSize(size: number): void {
    this._pageSize = Math.max(1, size);
    // Reset to page 0 or clamp
    this._page = Math.min(this._page, this.totalPages - 1);
    if (this._page < 0) this._page = 0;
    this.onChange?.(this.getState());
  }

  setTotalRows(total: number): void {
    this._totalRows = total;
    // Clamp current page
    if (this._page >= this.totalPages) {
      this._page = Math.max(0, this.totalPages - 1);
    }
    this.onChange?.(this.getState());
  }

  nextPage(): void {
    this.setPage(this._page + 1);
  }

  prevPage(): void {
    this.setPage(this._page - 1);
  }

  firstPage(): void {
    this.setPage(0);
  }

  lastPage(): void {
    this.setPage(this.totalPages - 1);
  }
}
