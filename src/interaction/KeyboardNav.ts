import type { SelectionModel } from '../core/SelectionModel.js';

export interface KeyboardNavCallbacks {
  onStartEdit: (row: number, col: number, initialChar?: string) => void;
  onDelete: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onCut: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onScrollTo: (row: number, col: number) => void;
}

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

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        this.selection.move(-1, 0, shift);
        if (this.selection.focus) this.callbacks.onScrollTo(this.selection.focus.row, this.selection.focus.col);
        break;

      case 'ArrowDown':
        e.preventDefault();
        this.selection.move(1, 0, shift);
        if (this.selection.focus) this.callbacks.onScrollTo(this.selection.focus.row, this.selection.focus.col);
        break;

      case 'ArrowLeft':
        e.preventDefault();
        this.selection.move(0, -1, shift);
        if (this.selection.focus) this.callbacks.onScrollTo(this.selection.focus.row, this.selection.focus.col);
        break;

      case 'ArrowRight':
        e.preventDefault();
        this.selection.move(0, 1, shift);
        if (this.selection.focus) this.callbacks.onScrollTo(this.selection.focus.row, this.selection.focus.col);
        break;

      case 'Tab':
        e.preventDefault();
        this.selection.move(0, shift ? -1 : 1, false);
        if (this.selection.focus) this.callbacks.onScrollTo(this.selection.focus.row, this.selection.focus.col);
        break;

      case 'Enter':
        e.preventDefault();
        if (focus) {
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
        if (ctrl) {
          this.selection.focusCell(0, 0);
        } else if (focus) {
          this.selection.focusCell(focus.row, 0);
        }
        if (this.selection.focus) this.callbacks.onScrollTo(this.selection.focus.row, this.selection.focus.col);
        break;

      case 'End':
        e.preventDefault();
        if (this.selection.focus) this.callbacks.onScrollTo(this.selection.focus.row, this.selection.focus.col);
        break;

      case 'a':
        if (ctrl) {
          e.preventDefault();
          this.selection.selectAll();
        } else {
          this.handleCharInput(e);
        }
        break;

      case 'c':
        if (ctrl) {
          e.preventDefault();
          this.callbacks.onCopy();
        } else {
          this.handleCharInput(e);
        }
        break;

      case 'v':
        if (ctrl) {
          e.preventDefault();
          this.callbacks.onPaste();
        } else {
          this.handleCharInput(e);
        }
        break;

      case 'x':
        if (ctrl) {
          e.preventDefault();
          this.callbacks.onCut();
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

  private handleCharInput(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const focus = this.selection.focus;
    if (!focus) return;
    e.preventDefault();
    this.callbacks.onStartEdit(focus.row, focus.col, e.key);
  }
}
