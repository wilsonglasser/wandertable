// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WanderTable } from '../../WanderTable.js';
import type { CellData, CellSource, GridIntent } from '../../types/index.js';

function stubLayout(): void {
  for (const prop of ['clientWidth', 'clientHeight'] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains('wt-scroll-container') ? (prop === 'clientWidth' ? 800 : 400) : 0;
      },
    });
  }
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function key(el: HTMLElement, k: string, mods: Partial<KeyboardEventInit> = {}): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods }));
}

function clipboardEvent(type: 'copy' | 'cut' | 'paste', data: Record<string, string> = {}): ClipboardEvent {
  const store = new Map(Object.entries(data));
  const e = new Event(type, { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(e, 'clipboardData', {
    value: {
      getData: (t: string) => store.get(t) ?? '',
      setData: (t: string, v: string) => store.set(t, v),
      store,
    },
  });
  return e;
}

class HostDoc implements CellSource {
  rowCount = 100;
  colCount = 8;
  cells = new Map<string, CellData>();
  getCell(row: number, col: number): CellData | undefined {
    return this.cells.get(`${row}:${col}`);
  }
  hasCell(row: number, col: number): boolean {
    return this.cells.has(`${row}:${col}`);
  }
}

describe('intents with an external source', () => {
  let host: HTMLElement;
  let root: HTMLElement;
  let doc: HostDoc;
  let table: WanderTable;
  let intents: GridIntent[];

  beforeEach(async () => {
    stubLayout();
    host = document.createElement('div');
    document.body.appendChild(host);
    doc = new HostDoc();
    doc.cells.set('0:0', { value: 'a' });
    doc.cells.set('0:1', { value: 'b' });
    doc.cells.set('1:0', { value: 'c' });
    intents = [];
    table = new WanderTable(host, {
      source: doc,
      onIntent: (i) => intents.push(i),
      clipboardHtml: (range) => `<x-field data-range="${range.startRow},${range.startCol}"></x-field>`,
    });
    root = host;
    await frame();
  });

  afterEach(() => {
    table.destroy();
    host.remove();
  });

  it('an editor commit becomes an edit intent and mutates nothing', async () => {
    table.setSelection([{ startRow: 0, startCol: 0, endRow: 0, endCol: 0 }]);
    key(root, 'x');
    const input = host.querySelector('input')!;
    input.value = 'typed';
    key(input, 'Enter');
    expect(intents).toContainEqual({ type: 'edit', row: 0, col: 0, value: 'typed', previous: 'a' });
    expect(doc.getCell(0, 0)?.value).toBe('a');
    let copied = 0;
    table.data.forEach(() => copied++);
    expect(copied).toBe(0);
    expect(table.getSelection()[0]).toMatchObject({ startRow: 1, startCol: 0 });
  });

  it('a native paste becomes a paste intent with cells resolved and the html kept', () => {
    table.setSelection([{ startRow: 2, startCol: 1, endRow: 2, endCol: 1 }]);
    root.dispatchEvent(clipboardEvent('paste', { 'text/plain': 'x\ty\r\nz\tw\r\n', 'text/html': '<b>h</b>' }));
    const paste = intents.find((i) => i.type === 'paste');
    expect(paste).toMatchObject({
      type: 'paste',
      anchor: { row: 2, col: 1 },
      values: [['x', 'y'], ['z', 'w']],
      html: '<b>h</b>',
      cells: [
        { row: 2, col: 1, value: 'x' },
        { row: 2, col: 2, value: 'y' },
        { row: 3, col: 1, value: 'z' },
        { row: 3, col: 2, value: 'w' },
      ],
    });
  });

  it('a single pasted value fills the whole selection', () => {
    table.setSelection([{ startRow: 0, startCol: 0, endRow: 1, endCol: 1 }]);
    root.dispatchEvent(clipboardEvent('paste', { 'text/plain': 'k' }));
    const paste = intents.find((i) => i.type === 'paste') as Extract<GridIntent, { type: 'paste' }>;
    expect(paste.cells).toHaveLength(4);
  });

  it('copy writes TSV plus the host html; cut also asks to clear', () => {
    table.setSelection([{ startRow: 0, startCol: 0, endRow: 0, endCol: 1 }]);
    const copy = clipboardEvent('copy');
    root.dispatchEvent(copy);
    const store = (copy.clipboardData as unknown as { store: Map<string, string> }).store;
    expect(store.get('text/plain')).toBe('a\tb');
    expect(store.get('text/html')).toBe('<x-field data-range="0,0"></x-field>');
    expect(intents).toEqual([]);

    root.dispatchEvent(clipboardEvent('cut'));
    expect(intents).toContainEqual({
      type: 'clear', ranges: [{ startRow: 0, startCol: 0, endRow: 0, endCol: 1 }], cut: true,
    });
  });

  it('Delete, Ctrl+Z and Ctrl+Shift+Z are intents for the host', () => {
    table.setSelection([{ startRow: 1, startCol: 0, endRow: 1, endCol: 0 }]);
    key(root, 'Delete');
    key(root, 'z', { ctrlKey: true });
    key(root, 'Z', { ctrlKey: true, shiftKey: true });
    expect(intents.map((i) => i.type)).toEqual(['clear', 'undo', 'redo']);
  });

  it('direct mutators refuse to write around the source', () => {
    expect(() => table.setCellValue(0, 0, 'x')).toThrow(/options\.source/);
    expect(() => table.applyPatch([])).toThrow(/options\.source/);
  });
});

describe('built-in DataModel', () => {
  let host: HTMLElement;
  let table: WanderTable;

  beforeEach(async () => {
    stubLayout();
    host = document.createElement('div');
    document.body.appendChild(host);
    table = new WanderTable(host, { rowCount: 50, colCount: 5 });
    table.setCell(0, 1, { value: 'locked', readOnly: true });
    table.setCell(0, 0, { value: 'free' });
    await frame();
  });

  afterEach(() => {
    table.destroy();
    host.remove();
  });

  it('paste and delete leave read-only cells alone', () => {
    table.setSelection([{ startRow: 0, startCol: 0, endRow: 0, endCol: 0 }]);
    host.dispatchEvent(clipboardEvent('paste', { 'text/plain': 'p\tq' }));
    expect(table.getCell(0, 0)?.value).toBe('p');
    expect(table.getCell(0, 1)?.value).toBe('locked');

    table.setSelection([{ startRow: 0, startCol: 0, endRow: 0, endCol: 1 }]);
    key(host, 'Delete');
    expect(table.getCell(0, 0)).toBeUndefined();
    expect(table.getCell(0, 1)?.value).toBe('locked');
  });
});

describe('keyboard', () => {
  let host: HTMLElement;
  let table: WanderTable;

  beforeEach(async () => {
    stubLayout();
    host = document.createElement('div');
    document.body.appendChild(host);
    table = new WanderTable(host, { rowCount: 50, colCount: 5 });
    for (let r = 0; r < 4; r++) table.setCell(r, 0, { value: `v${r}` });
    table.setCell(10, 0, { value: 'far' });
    await frame();
    table.setSelection([{ startRow: 0, startCol: 0, endRow: 0, endCol: 0 }]);
  });

  afterEach(() => {
    table.destroy();
    host.remove();
  });

  it('Shift+Arrow keeps growing the range', () => {
    key(host, 'ArrowDown', { shiftKey: true });
    key(host, 'ArrowDown', { shiftKey: true });
    expect(table.getSelection()[0]).toEqual({ startRow: 0, startCol: 0, endRow: 2, endCol: 0 });
  });

  it('Ctrl+Arrow stops at the end of the filled run, then jumps to the next one', () => {
    key(host, 'ArrowDown', { ctrlKey: true });
    expect(table.getSelection()[0]).toMatchObject({ startRow: 3, startCol: 0 });
    key(host, 'ArrowDown', { ctrlKey: true });
    expect(table.getSelection()[0]).toMatchObject({ startRow: 10, startCol: 0 });
    key(host, 'ArrowDown', { ctrlKey: true });
    expect(table.getSelection()[0]).toMatchObject({ startRow: 49, startCol: 0 });
  });

  it('End goes to the last column, Ctrl+End to the last cell', () => {
    key(host, 'End');
    expect(table.getSelection()[0]).toMatchObject({ startRow: 0, startCol: 4 });
    key(host, 'End', { ctrlKey: true });
    expect(table.getSelection()[0]).toMatchObject({ startRow: 49, startCol: 4 });
  });
});

describe('labels', () => {
  it('relabels built-in menu items by id and keeps the defaults for the rest', () => {
    stubLayout();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const table = new WanderTable(host, { labels: { copy: 'Copiar', undo: 'Desfazer' } });
    const byId = (id: string) => table.contextMenuItems.find((i) => i.id === id)?.label;
    expect(byId('copy')).toBe('Copiar');
    expect(byId('undo')).toBe('Desfazer');
    expect(byId('paste')).toBe('Paste');
    table.destroy();
    host.remove();
  });
});

describe('editor choice', () => {
  it('a custom cell type without its own editor edits as text', async () => {
    stubLayout();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const doc = new HostDoc();
    doc.cells.set('0:0', { value: 'old', type: 'custom-kind' });
    const intents: GridIntent[] = [];
    const table = new WanderTable(host, { source: doc, onIntent: (i) => intents.push(i) });
    table.registerRenderer('custom-kind', { render(el, data) { el.textContent = String(data?.value ?? ''); } });
    await frame();
    table.setSelection([{ startRow: 0, startCol: 0, endRow: 0, endCol: 0 }]);
    key(host, 'F2');
    const input = host.querySelector('input')!;
    expect(input).toBeTruthy();
    input.value = 'new';
    key(input, 'Enter');
    expect(intents).toContainEqual({ type: 'edit', row: 0, col: 0, value: 'new', previous: 'old' });
    table.destroy();
    host.remove();
  });
});

describe('type to replace', () => {
  it('focuses the editor at once and keeps the first typed character', async () => {
    stubLayout();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const table = new WanderTable(host, { rowCount: 10, colCount: 3 });
    table.setCell(0, 0, { value: 'old' });
    await frame();
    table.setSelection([{ startRow: 0, startCol: 0, endRow: 0, endCol: 0 }]);
    key(host, 'v');
    const input = host.querySelector('input')!;
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('v');
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(1);
    table.destroy();
    host.remove();
  });
});

describe('getSelection', () => {
  it('returns whole-row and whole-column selections clamped to the grid', async () => {
    stubLayout();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const table = new WanderTable(host, { rowCount: 30, colCount: 6 });
    await frame();
    table.selection.selectRow(4);
    expect(table.getSelection()).toEqual([{ startRow: 4, startCol: 0, endRow: 4, endCol: 5 }]);
    table.selection.selectColumn(2);
    expect(table.getSelection()).toEqual([{ startRow: 0, startCol: 2, endRow: 29, endCol: 2 }]);
    table.selection.selectAll();
    expect(table.getSelection()).toEqual([{ startRow: 0, startCol: 0, endRow: 29, endCol: 5 }]);
    table.destroy();
    host.remove();
  });
});

describe('whole-row clear', () => {
  it('Delete on a selected row sends a clamped range', async () => {
    stubLayout();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const doc = new HostDoc();
    const intents: GridIntent[] = [];
    const table = new WanderTable(host, { source: doc, onIntent: (i) => intents.push(i) });
    await frame();
    table.selection.selectRow(3);
    key(host, 'Delete');
    expect(intents[0]).toEqual({ type: 'clear', ranges: [{ startRow: 3, startCol: 0, endRow: 3, endCol: 7 }], cut: false });
    table.destroy();
    host.remove();
  });
});
