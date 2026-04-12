import type { CellBounds, CellData, CellEditor } from '../types/index.js';

/**
 * Editor for blank cells - does not allow editing.
 * Optionally calls `onAttempt` when the user tries to edit,
 * so you can open a modal, redirect, etc.
 */
export class BlankEditor implements CellEditor {
  private el!: HTMLElement;
  private onAttempt: ((row: number, col: number) => void) | null;
  private row = -1;
  private col = -1;

  constructor(onAttempt?: (row: number, col: number) => void) {
    this.onAttempt = onAttempt ?? null;
  }

  createElement(container: HTMLElement): HTMLElement {
    this.el = document.createElement('div');
    container.appendChild(this.el);
    return this.el;
  }

  open(_value: unknown, _bounds: CellBounds, _cellData: CellData | undefined): void {
    // Fire the callback and immediately close
    if (this.onAttempt) {
      this.onAttempt(this.row, this.col);
    }
  }

  /** Called by EditorManager before open() to pass row/col */
  setPosition(row: number, col: number): void {
    this.row = row;
    this.col = col;
  }

  getValue(): unknown {
    return undefined;
  }

  close(): void {
    this.el?.remove();
  }
}
