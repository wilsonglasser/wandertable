import type { ColumnModel } from '../columns/ColumnModel.js';

export class ColumnReorder {
  private columns: ColumnModel;
  private dragging = false;
  private sourceCol = -1;
  private targetCol = -1;
  private ghostEl: HTMLElement | null = null;
  private indicatorEl: HTMLElement | null = null;

  onReorder: ((fromCol: number, toCol: number) => void) | null = null;

  /** Resolve column index from screen X */
  getColAtX: ((clientX: number) => number) | null = null;
  /** Get column header label */
  getColLabel: ((col: number) => string) | null = null;

  constructor(columns: ColumnModel) {
    this.columns = columns;
  }

  start(col: number, event: MouseEvent, container: HTMLElement): void {
    this.dragging = true;
    this.sourceCol = col;
    this.targetCol = col;

    // Create ghost element
    this.ghostEl = document.createElement('div');
    this.ghostEl.className = 'wt-reorder-ghost';
    this.ghostEl.textContent = this.getColLabel?.(col) ?? String(col);
    this.ghostEl.style.left = `${event.clientX}px`;
    this.ghostEl.style.top = `${event.clientY - 14}px`;
    document.body.appendChild(this.ghostEl);

    // Create drop indicator
    this.indicatorEl = document.createElement('div');
    this.indicatorEl.className = 'wt-reorder-indicator';
    this.indicatorEl.style.display = 'none';
    container.appendChild(this.indicatorEl);

    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  }

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.dragging) return;

    // Move ghost
    if (this.ghostEl) {
      this.ghostEl.style.left = `${e.clientX}px`;
      this.ghostEl.style.top = `${e.clientY - 14}px`;
    }

    // Update target
    if (this.getColAtX) {
      this.targetCol = this.getColAtX(e.clientX);
    }

    // Position indicator
    if (this.indicatorEl && this.targetCol >= 0) {
      const x = this.columns.getX(this.targetCol);
      this.indicatorEl.style.display = '';
      this.indicatorEl.style.left = `${x}px`;
    }
  };

  private onMouseUp = (): void => {
    if (!this.dragging) return;
    this.dragging = false;

    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    this.ghostEl?.remove();
    this.ghostEl = null;
    this.indicatorEl?.remove();
    this.indicatorEl = null;

    if (this.sourceCol !== this.targetCol && this.targetCol >= 0) {
      this.onReorder?.(this.sourceCol, this.targetCol);
    }
  };

  destroy(): void {
    this.ghostEl?.remove();
    this.indicatorEl?.remove();
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
  }
}
