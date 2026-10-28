import type { CellSource, SelectionRange } from '../types/index.js';
import type { SelectionModel } from '../core/SelectionModel.js';
import { serializeTSV } from './tsv.js';

export interface ClipboardPayload {
  text: string;
  html: string;
}

/**
 * Host-specific text/html for a copied range (e.g. a field payload); null = default table.
 * `cut` tells a cut from a copy (the host may move instead of duplicating on paste).
 */
export type ClipboardHtmlFn = (range: SelectionRange, info: { cut: boolean }) => string | null;

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Builds and reads clipboard payloads. Keyboard copy/cut/paste go through the
 * native ClipboardEvent (see WanderTable); the async methods here back the
 * context menu, where no native event exists.
 */
export class ClipboardManager {
  private source: CellSource;
  private selection: SelectionModel;
  private htmlFor: ClipboardHtmlFn | null;

  constructor(source: CellSource, selection: SelectionModel, htmlFor: ClipboardHtmlFn | null = null) {
    this.source = source;
    this.selection = selection;
    this.htmlFor = htmlFor;
  }

  /** text/plain (TSV) and text/html of the selection's bounding range. */
  payload(cut = false): ClipboardPayload | null {
    const bounds = this.selection.getBounds();
    if (!bounds) return null;

    const rows: string[][] = [];
    for (let r = bounds.r1; r <= bounds.r2; r++) {
      const cols: string[] = [];
      for (let c = bounds.c1; c <= bounds.c2; c++) {
        const val = this.source.getCell(r, c)?.value;
        cols.push(val != null ? String(val) : '');
      }
      rows.push(cols);
    }
    const range: SelectionRange = { startRow: bounds.r1, startCol: bounds.c1, endRow: bounds.r2, endCol: bounds.c2 };
    const html = this.htmlFor?.(range, { cut })
      ?? `<table>${rows.map((r) => `<tr>${r.map((v) => `<td>${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</table>`;
    return { text: serializeTSV(rows), html };
  }

  /** Fill a native copy/cut event. Returns false when there is nothing to copy. */
  writeEvent(e: ClipboardEvent, cut = false): boolean {
    const payload = this.payload(cut);
    if (!payload || !e.clipboardData) return false;
    e.clipboardData.setData('text/plain', payload.text);
    e.clipboardData.setData('text/html', payload.html);
    e.preventDefault();
    return true;
  }

  /** Context-menu copy: async Clipboard API, plain text fallback. */
  async copyAsync(cut = false): Promise<boolean> {
    const payload = this.payload(cut);
    if (!payload) return false;
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([payload.text], { type: 'text/plain' }),
            'text/html': new Blob([payload.html], { type: 'text/html' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(payload.text);
      }
      return true;
    } catch {
      return this.fallbackCopy(payload.text);
    }
  }

  /** Context-menu paste: needs clipboard-read permission; null when denied. */
  async readAsync(): Promise<{ text: string; html: string | null } | null> {
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        let text = '';
        let html: string | null = null;
        for (const item of items) {
          if (item.types.includes('text/plain')) text = await (await item.getType('text/plain')).text();
          if (item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
        }
        return { text, html };
      }
      return { text: await navigator.clipboard.readText(), html: null };
    } catch {
      return null;
    }
  }

  private fallbackCopy(text: string): boolean {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  }
}
