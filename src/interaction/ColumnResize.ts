import type { ColumnModel } from '../columns/ColumnModel.js';

export class ColumnResize {
  private columns: ColumnModel;
  private resizing = false;
  private resizeCol = -1;
  private startX = 0;
  private startWidth = 0;

  onResize: ((col: number, width: number) => void) | null = null;

  constructor(columns: ColumnModel) {
    this.columns = columns;
  }

  start(col: number, clientX: number): void {
    if (col < 0 || col >= this.columns.count) return;
    this.resizing = true;
    this.resizeCol = col;
    this.startX = clientX;
    this.startWidth = this.columns.getWidth(col);

    document.addEventListener('mousemove', this.handleMove);
    document.addEventListener('mouseup', this.handleUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  private handleMove = (e: MouseEvent): void => {
    if (!this.resizing) return;
    const delta = e.clientX - this.startX;
    const newWidth = Math.max(30, this.startWidth + delta);
    this.columns.setWidth(this.resizeCol, newWidth);
    this.onResize?.(this.resizeCol, newWidth);
  };

  private handleUp = (): void => {
    this.resizing = false;
    document.removeEventListener('mousemove', this.handleMove);
    document.removeEventListener('mouseup', this.handleUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  destroy(): void {
    document.removeEventListener('mousemove', this.handleMove);
    document.removeEventListener('mouseup', this.handleUp);
  }
}
