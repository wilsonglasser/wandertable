import type { CellBounds, CellData, CellEditor } from '../types/index.js';

export class EditorManager {
  private editors = new Map<string, () => CellEditor>();
  private activeEditor: CellEditor | null = null;
  private activeEditorEl: HTMLElement | null = null;
  private activeRow = -1;
  private activeCol = -1;
  private overlayEl: HTMLElement;

  onClose: ((row: number, col: number, value: unknown, cancelled: boolean) => void) | null = null;

  constructor(container: HTMLElement) {
    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'wt-editor-overlay';
    this.overlayEl.style.display = 'none';
    container.appendChild(this.overlayEl);

    // Register default editors
    this.register('text', () => new TextEditorImpl());
    this.register('blank', () => new BlankEditorImpl());
  }

  register(name: string, factory: () => CellEditor): void {
    this.editors.set(name, factory);
  }

  get isEditing(): boolean {
    return this.activeEditor !== null;
  }

  get editingCell(): { row: number; col: number } | null {
    if (!this.activeEditor) return null;
    return { row: this.activeRow, col: this.activeCol };
  }

  open(
    row: number,
    col: number,
    editorType: string,
    value: unknown,
    bounds: CellBounds,
    cellData: CellData | undefined,
    initialChar?: string,
  ): void {
    this.close(false);

    const factory = this.editors.get(editorType);
    if (!factory) return;

    this.activeRow = row;
    this.activeCol = col;
    this.activeEditor = factory();

    // Position overlay
    this.overlayEl.style.display = '';
    this.overlayEl.style.left = `${bounds.x}px`;
    this.overlayEl.style.top = `${bounds.y}px`;
    this.overlayEl.style.width = `${bounds.width}px`;
    this.overlayEl.style.height = `${bounds.height}px`;

    this.activeEditorEl = this.activeEditor.createElement(this.overlayEl);

    // If initialChar is provided, start with that character instead of the current value
    const openValue = initialChar !== undefined ? initialChar : value;
    this.activeEditor.open(openValue, bounds, cellData);

    // Handle key events on the editor
    this.activeEditorEl.addEventListener('keydown', this.handleEditorKey);
  }

  close(save: boolean): void {
    if (!this.activeEditor) return;

    const editor = this.activeEditor;
    const row = this.activeRow;
    const col = this.activeCol;
    let value: unknown;

    if (save) {
      value = editor.getValue();
      if (editor.validate) {
        const result = editor.validate(value);
        if (result !== true) {
          // Validation failed
          return;
        }
      }
    }

    // Remove listener before clearing DOM
    if (this.activeEditorEl) {
      this.activeEditorEl.removeEventListener('keydown', this.handleEditorKey);
      this.activeEditorEl = null;
    }
    editor.close();
    this.overlayEl.innerHTML = '';
    this.overlayEl.style.display = 'none';
    this.activeEditor = null;
    this.activeRow = -1;
    this.activeCol = -1;

    this.onClose?.(row, col, save ? value : undefined, !save);
  }

  private handleEditorKey = (e: KeyboardEvent): void => {
    switch (e.key) {
      case 'Enter':
        if (!e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          this.close(true);
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.close(false);
        break;
      case 'Tab':
        e.preventDefault();
        e.stopPropagation();
        this.close(true);
        break;
    }
  };

  destroy(): void {
    this.close(false);
    this.overlayEl.remove();
  }
}

// ── Built-in Text Editor ──

class TextEditorImpl implements CellEditor {
  private input!: HTMLInputElement;

  createElement(container: HTMLElement): HTMLElement {
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.className = 'wt-editor-input';
    container.appendChild(this.input);
    return this.input;
  }

  open(value: unknown, _bounds: CellBounds, _cellData: CellData | undefined): void {
    this.input.value = value != null ? String(value) : '';
    requestAnimationFrame(() => {
      this.input.focus();
      this.input.select();
    });
  }

  getValue(): unknown {
    return this.input.value;
  }

  close(): void {
    this.input.remove();
  }
}

// ── Built-in Blank Editor (non-editable, closes immediately) ──

class BlankEditorImpl implements CellEditor {
  private el!: HTMLElement;

  createElement(container: HTMLElement): HTMLElement {
    this.el = document.createElement('div');
    container.appendChild(this.el);
    return this.el;
  }

  open(): void {
    // Blank cells are not editable - close immediately on next tick
    // The EditorManager.onClose will fire with cancelled=true
  }

  getValue(): unknown {
    return undefined;
  }

  close(): void {
    this.el?.remove();
  }
}
