import type { DataModel } from '../core/DataModel.js';
import type { SelectionModel } from '../core/SelectionModel.js';
import type { CellPatch } from '../types/index.js';

export class ClipboardManager {
  private data: DataModel;
  private selection: SelectionModel;

  onChange: ((patches: CellPatch[]) => void) | null = null;

  constructor(data: DataModel, selection: SelectionModel) {
    this.data = data;
    this.selection = selection;
  }

  async copy(): Promise<void> {
    const tsv = this.selectionToTSV();
    if (!tsv) return;

    try {
      await navigator.clipboard.writeText(tsv);
    } catch {
      // Fallback for non-secure contexts
      this.fallbackCopy(tsv);
    }
  }

  async cut(): Promise<void> {
    await this.copy();
    this.deleteSelected();
  }

  async paste(): Promise<void> {
    const focus = this.selection.focus;
    if (!focus) return;

    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return;
    }

    const rows = this.parseTSV(text);
    if (rows.length === 0) return;

    const isSingleCell = rows.length === 1 && rows[0].length === 1;
    const patches: CellPatch[] = [];

    if (isSingleCell && !this.isFullRowOrColSelected()) {
      // Single cell copied: fill into all selected cells
      const value = rows[0][0];
      this.selection.forEachSelected((row, col) => {
        if (row < this.data.rowCount && col < this.data.colCount) {
          patches.push({ row, col, data: { value } });
        }
      });
    } else {
      // Multi-cell paste: place starting from focus
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r].length; c++) {
          const targetRow = focus.row + r;
          const targetCol = focus.col + c;
          if (targetRow >= this.data.rowCount || targetCol >= this.data.colCount) continue;
          patches.push({
            row: targetRow,
            col: targetCol,
            data: { value: rows[r][c] },
          });
        }
      }
    }

    if (patches.length > 0) {
      this.data.applyPatch(patches);
      this.onChange?.(patches);
    }
  }

  /** Check if current selection spans an entire row or column */
  private isFullRowOrColSelected(): boolean {
    const bounds = this.selection.getBounds();
    if (!bounds) return false;
    const isFullRow = bounds.c1 === 0 && bounds.c2 === this.data.colCount - 1;
    const isFullCol = bounds.r1 === 0 && bounds.r2 === this.data.rowCount - 1;
    return isFullRow || isFullCol;
  }

  deleteSelected(): void {
    const patches: CellPatch[] = [];
    this.selection.forEachSelected((row, col) => {
      if (this.data.hasCell(row, col)) {
        patches.push({ row, col, data: { value: undefined } });
      }
    });
    if (patches.length > 0) {
      this.data.applyPatch(patches);
      this.onChange?.(patches);
    }
  }

  private selectionToTSV(): string | null {
    const bounds = this.selection.getBounds();
    if (!bounds) return null;

    const lines: string[] = [];
    for (let r = bounds.r1; r <= bounds.r2; r++) {
      const cols: string[] = [];
      for (let c = bounds.c1; c <= bounds.c2; c++) {
        const cell = this.data.getCell(r, c);
        const val = cell?.value;
        cols.push(val != null ? String(val) : '');
      }
      lines.push(cols.join('\t'));
    }
    return lines.join('\n');
  }

  private parseTSV(text: string): string[][] {
    return text.split('\n').map(line => line.split('\t'));
  }

  private fallbackCopy(text: string): void {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
}
