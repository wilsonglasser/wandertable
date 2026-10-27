import type { CellAddress } from '../types/index.js';
import type { SelectionModel } from '../core/SelectionModel.js';

export interface KeyboardNavCallbacks {
  onStartEdit: (row: number, col: number, initialChar?: string) => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onScrollTo: (row: number, col: number) => void;
  /** Rows that fit in the viewport (PageUp/PageDown step). */
  pageRows: () => number;
  /** Ctrl+Arrow target from `from` in direction (dRow, dCol): the data edge. */
  jumpTarget: (from: CellAddress, dRow: number, dCol: number) => CellAddress;
}

/**
 * Spreadsheet keys. Ctrl+C / Ctrl+X / Ctrl+V are deliberately not handled:
 * the browser then fires native copy/cut/paste events, which carry both
 * text/plain and text/html and need no clipboard permission.
 */
export class KeyboardNav {
  private selection: SelectionModel;
  private callbacks: KeyboardNavCallbacks;

  constructor(selection: SelectionModel, callbacks: KeyboardNavCallbacks) {
    this.selection = selection;
    this.callbacks = callbacks;
  }

  handleKeyDown(e: KeyboardEvent): void {
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const focus = this.selection.focus;
    // With Shift held a letter arrives upper-case ('Z'): match on lower-case.
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    switch (key) {
      case 'ArrowUp':
        e.preventDefault();
        this.arrow(-1, 0, ctrl, shift);
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.arrow(1, 0, ctrl, shift);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.arrow(0, -1, ctrl, shift);
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.arrow(0, 1, ctrl, shift);
        break;

      case 'PageDown':
      case 'PageUp': {
        e.preventDefault();
        const step = Math.max(1, this.callbacks.pageRows() - 1);
        this.selection.move(key === 'PageDown' ? step : -step, 0, shift);
        this.scrollToActive();
        break;
      }

      case 'Tab':
        e.preventDefault();
        this.selection.move(0, shift ? -1 : 1, false);
        this.scrollToActive();
        break;

      case 'Enter':
        e.preventDefault();
        if (shift) {
          this.selection.move(-1, 0, false);
          this.scrollToActive();
        } else if (focus) {
          this.callbacks.onStartEdit(focus.row, focus.col);
        }
        break;

      case 'F2':
        e.preventDefault();
        if (focus) {
          this.callbacks.onStartEdit(focus.row, focus.col);
        }
        break;

      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        this.callbacks.onDelete();
        break;

      case 'Escape':
        e.preventDefault();
        this.selection.clear();
        break;

      case 'Home':
        e.preventDefault();
        this.moveTo(ctrl ? 0 : focus?.row ?? 0, 0, shift);
        break;

      case 'End':
        e.preventDefault();
        this.moveTo(ctrl ? this.selection.rowCount - 1 : focus?.row ?? 0, this.selection.colCount - 1, shift);
        break;

      case 'a':
        if (ctrl) {
          e.preventDefault();
          this.selection.selectAll();
        } else {
          this.handleCharInput(e);
        }
        break;

      case 'z':
        if (ctrl) {
          e.preventDefault();
          if (shift) {
            this.callbacks.onRedo();
          } else {
            this.callbacks.onUndo();
          }
        } else {
          this.handleCharInput(e);
        }
        break;

      case 'y':
        if (ctrl) {
          e.preventDefault();
          this.callbacks.onRedo();
        } else {
          this.handleCharInput(e);
        }
        break;

      default:
        if (!ctrl && !e.altKey && e.key.length === 1) {
          this.handleCharInput(e);
        }
        break;
    }
  }

  private arrow(dRow: number, dCol: number, ctrl: boolean, shift: boolean): void {
    if (ctrl) {
      const from = (shift ? this.selection.head : null) ?? this.selection.focus ?? { row: 0, col: 0 };
      const target = this.callbacks.jumpTarget(from, dRow, dCol);
      this.moveTo(target.row, target.col, shift);
      return;
    }
    this.selection.move(dRow, dCol, shift);
    this.scrollToActive();
  }

  private moveTo(row: number, col: number, extend: boolean): void {
    if (extend && this.selection.focus) {
      this.selection.extendTo(row, col);
    } else {
      this.selection.focusCell(row, col);
    }
    this.scrollToActive();
  }

  /** Keep the moving corner in view (the head when extending). */
  private scrollToActive(): void {
    const target = this.selection.head ?? this.selection.focus;
    if (target) this.callbacks.onScrollTo(target.row, target.col);
  }

  private handleCharInput(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const focus = this.selection.focus;
    if (!focus) return;
    e.preventDefault();
    this.callbacks.onStartEdit(focus.row, focus.col, e.key);
  }
}
