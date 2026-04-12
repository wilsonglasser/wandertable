import type { RowModel } from '../rows/RowModel.js';

export class RowResize {
  private rows: RowModel;
  private resizing = false;
  private resizeRow = -1;
  private startY = 0;
  private startHeight = 0;

  onResize: ((row: number, height: number) => void) | null = null;

  constructor(rows: RowModel) {
    this.rows = rows;
  }

  start(row: number, clientY: number): void {
    this.resizing = true;
    this.resizeRow = row;
    this.startY = clientY;
    this.startHeight = this.rows.getHeight(row);

    document.addEventListener('mousemove', this.handleMove);
    document.addEventListener('mouseup', this.handleUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }

  private handleMove = (e: MouseEvent): void => {
    if (!this.resizing) return;
    const delta = e.clientY - this.startY;
    const newHeight = Math.max(20, this.startHeight + delta);
    this.rows.setHeight(this.resizeRow, newHeight);
    this.onResize?.(this.resizeRow, newHeight);
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
