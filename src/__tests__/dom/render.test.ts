// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WanderTable } from '../../WanderTable.js';
import type { CellData, CellSource } from '../../types/index.js';

const VIEW_W = 800;
let VIEW_H = 400;
const ROW_H = 28;

/** happy-dom has no layout engine: give the scroll container a fixed client box. */
function stubLayout(): void {
  for (const prop of ['clientWidth', 'clientHeight'] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get(this: HTMLElement) {
        if (this.classList.contains('wt-scroll-container') || this.classList.contains('wt-root')) {
          return prop === 'clientWidth' ? VIEW_W : VIEW_H;
        }
        return 0;
      },
    });
  }
}

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function visibleCells(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('.wt-cell')].filter(
    (el) => el.style.display !== 'none' && el.dataset.row !== undefined && (el.parentElement as HTMLElement).style.display !== 'none',
  );
}

function cellAt(root: HTMLElement, row: number, col: number): HTMLElement | undefined {
  return visibleCells(root).find((el) => el.dataset.row === String(row) && el.dataset.col === String(col));
}

describe('DOMRenderer (virtualized, scroll layout)', () => {
  let host: HTMLElement;
  let table: WanderTable;

  beforeEach(async () => {
    stubLayout();
    host = document.createElement('div');
    document.body.appendChild(host);
    table = new WanderTable(host, {
      mode: 'spreadsheet',
      layout: 'scroll',
      rowCount: 5000,
      colCount: 37,
      defaultRowHeight: ROW_H,
      defaultColWidth: 100,
      showRowHeaders: true,
      showColHeaders: true,
    });
    const patches = [];
    for (let r = 0; r < 2000; r++) {
      for (let c = 0; c < 37; c++) {
        patches.push({ row: r, col: c, data: { value: `L${r}-${c}` } });
      }
    }
    table.applyPatch(patches);
    await frame();
  });

  afterEach(() => {
    table.destroy();
    host.remove();
  });

  it('renders only the viewport plus overscan, with the right content', () => {
    const cells = visibleCells(host);
    const rows = new Set(cells.map((el) => Number(el.dataset.row)));
    expect(Math.max(...rows)).toBeLessThan(Math.ceil(VIEW_H / ROW_H) + 5);
    expect(cellAt(host, 0, 0)?.textContent).toBe('L0-0');
    expect(cellAt(host, 3, 2)?.textContent).toBe('L3-2');
  });

  it('keeps row headers aligned with body rows after a deep vertical scroll', async () => {
    const sc = host.querySelector<HTMLElement>('.wt-scroll-container')!;
    sc.scrollTop = ROW_H * 1500;
    sc.dispatchEvent(new Event('scroll'));
    await frame();

    expect(cellAt(host, 1500, 0)?.textContent).toBe('L1500-0');
    const inner = host.querySelector<HTMLElement>('.wt-row-headers-inner')!;
    expect(inner.style.transform).toBe(`translateY(${-ROW_H * 1500}px)`);
    const header = [...inner.children].find(
      (el) => (el as HTMLElement).dataset.row === '1500' && (el as HTMLElement).style.display !== 'none',
    ) as HTMLElement | undefined;
    expect(header?.textContent).toBe('1501');
    expect(header?.style.transform).toBe(`translateY(${ROW_H * 1500}px)`);
  });

  it('repaints a cell after a value change', async () => {
    table.setCellValue(2, 1, 'changed');
    await frame();
    expect(cellAt(host, 2, 1)?.textContent).toBe('changed');
  });

  it('expands a merge anchor over its span', async () => {
    table.mergeCells(1, 1, 2, 3);
    await frame();
    const anchor = cellAt(host, 1, 1)!;
    expect(anchor.style.width).toBe('300px');
    expect(anchor.style.height).toBe(`${ROW_H * 2}px`);
    expect(cellAt(host, 1, 2)).toBeUndefined();
  });
});

describe('external CellSource', () => {
  /** Host-owned document: one string per cell, no CellData copies kept by the grid. */
  class HostDoc implements CellSource {
    rowCount = 3000;
    colCount = 10;
    values = new Map<number, string>();
    reads = 0;
    getCell(row: number, col: number): CellData | undefined {
      this.reads++;
      const v = this.values.get(row * 1000 + col);
      return v === undefined ? undefined : { value: v };
    }
    hasCell(row: number, col: number): boolean {
      return this.values.has(row * 1000 + col);
    }
  }

  let host: HTMLElement;
  let doc: HostDoc;
  let table: WanderTable;

  beforeEach(async () => {
    stubLayout();
    host = document.createElement('div');
    document.body.appendChild(host);
    doc = new HostDoc();
    for (let r = 0; r < 3000; r++) {
      doc.values.set(r * 1000, `doc ${r}`);
    }
    table = new WanderTable(host, { source: doc, defaultRowHeight: ROW_H, defaultColWidth: 100 });
    await frame();
  });

  afterEach(() => {
    table.destroy();
    host.remove();
  });

  it('paints from the source without copying it into the DataModel', () => {
    expect(cellAt(host, 0, 0)?.textContent).toBe('doc 0');
    expect(table.getCell(2999, 0)?.value).toBe('doc 2999');
    let copied = 0;
    table.data.forEach(() => copied++);
    expect(copied).toBe(0);
    expect(doc.reads).toBeGreaterThan(0);
  });

  it('repaints host mutations on invalidate()', async () => {
    doc.values.set(1 * 1000 + 2, 'edited by host');
    table.invalidate();
    await frame();
    expect(cellAt(host, 1, 2)?.textContent).toBe('edited by host');
  });

  it('grows to the new size on setSize()', async () => {
    doc.rowCount = 4000;
    doc.values.set(3999 * 1000, 'last');
    table.setSize(4000, 10);
    const sc = host.querySelector<HTMLElement>('.wt-scroll-container')!;
    sc.scrollTop = ROW_H * 3990;
    sc.dispatchEvent(new Event('scroll'));
    await frame();
    expect(cellAt(host, 3999, 0)?.textContent).toBe('last');
  });
});

describe('incremental paint', () => {
  let host: HTMLElement;
  let table: WanderTable;
  let paints: string[];
  let cleanups = 0;

  beforeEach(async () => {
    stubLayout();
    host = document.createElement('div');
    document.body.appendChild(host);
    paints = [];
    cleanups = 0;
    table = new WanderTable(host, {
      rowCount: 2000,
      colCount: 10,
      defaultRowHeight: ROW_H,
      defaultColWidth: 100,
      defaultCellType: 'probe',
      cellLabel: (row, col, data) => (data ? `R${row + 1}C${col + 1} ${String(data.value)}` : null),
    });
    table.registerRenderer('probe', {
      render(el, data) {
        paints.push(`${el.dataset.row}:${el.dataset.col}`);
        el.textContent = data?.value == null ? '' : String(data.value);
      },
      cleanup() {
        cleanups++;
      },
    });
    const patches = [];
    for (let r = 0; r < 2000; r++) {
      patches.push({ row: r, col: 0, data: { value: `v${r}`, className: r === 0 ? 'custom-zero' : undefined } });
    }
    table.applyPatch(patches);
    await frame();
    paints = [];
  });

  afterEach(() => {
    table.destroy();
    host.remove();
    VIEW_H = 400;
  });

  it('a row parked in the pool repaints when it comes back after its cell changed', async () => {
    const sc = host.querySelector<HTMLElement>('.wt-scroll-container')!;
    // 260px shows rows 0-12 (with overscan); 230px parks just row 12, so the
    // pool hands that same element back when the viewport grows again.
    VIEW_H = 260;
    sc.dispatchEvent(new Event('scroll'));
    await frame();
    VIEW_H = 230;
    sc.dispatchEvent(new Event('scroll'));
    await frame();
    expect(cellAt(host, 12, 0)).toBeUndefined();
    table.setCellValue(12, 0, 'changed while parked');
    await frame();
    VIEW_H = 260;
    sc.dispatchEvent(new Event('scroll'));
    await frame();
    expect(cellAt(host, 12, 0)?.textContent).toBe('changed while parked');
  });

  it('a selection change repaints no cell content, only state', async () => {
    table.setSelection([{ startRow: 2, startCol: 1, endRow: 2, endCol: 1 }]);
    await frame();
    expect(paints).toEqual([]);
    expect(cellAt(host, 2, 1)?.classList.contains('wt-cell--selected')).toBe(true);
    expect(cellAt(host, 2, 1)?.getAttribute('aria-selected')).toBe('true');
    expect(cellAt(host, 0, 0)?.getAttribute('aria-selected')).toBe('false');
  });

  it('a value change repaints only that cell', async () => {
    table.setCellValue(5, 0, 'new');
    await frame();
    expect(paints).toEqual(['5:0']);
    expect(cellAt(host, 5, 0)?.textContent).toBe('new');
  });

  it('a recycled element drops the previous cell class and runs cleanup', async () => {
    expect(cellAt(host, 0, 0)?.classList.contains('custom-zero')).toBe(true);
    const sc = host.querySelector<HTMLElement>('.wt-scroll-container')!;
    sc.scrollTop = ROW_H * 1000;
    sc.dispatchEvent(new Event('scroll'));
    await frame();
    expect(host.querySelectorAll('.wt-cell.custom-zero').length).toBe(0);
    expect(cleanups).toBeGreaterThan(0);
  });

  it('a cell changed while off-screen shows the new value when scrolled back', async () => {
    const sc = host.querySelector<HTMLElement>('.wt-scroll-container')!;
    sc.scrollTop = ROW_H * 1000;
    sc.dispatchEvent(new Event('scroll'));
    await frame();
    table.setCellValue(1, 0, 'changed while away');
    await frame();
    sc.scrollTop = 0;
    sc.dispatchEvent(new Event('scroll'));
    await frame();
    expect(cellAt(host, 1, 0)?.textContent).toBe('changed while away');
  });

  it('exposes an ARIA grid with indexes, names and the active cell', async () => {
    const root = host.querySelector<HTMLElement>('.wt-root') ?? host;
    expect(root.getAttribute('role')).toBe('grid');
    expect(root.getAttribute('aria-rowcount')).toBe('2001');
    expect(root.getAttribute('aria-colcount')).toBe('10');

    const cell = cellAt(host, 4, 0)!;
    expect(cell.getAttribute('role')).toBe('gridcell');
    expect(cell.getAttribute('aria-colindex')).toBe('1');
    expect(cell.parentElement?.getAttribute('role')).toBe('row');
    expect(cell.parentElement?.getAttribute('aria-rowindex')).toBe('6');
    expect(cell.getAttribute('aria-label')).toBe('R5C1 v4');
    expect(cellAt(host, 4, 1)?.hasAttribute('aria-label')).toBe(false);

    const header = host.querySelector<HTMLElement>('.wt-col-header-cell')!;
    expect(header.getAttribute('role')).toBe('columnheader');
    expect(host.querySelector('.wt-row-headers')?.getAttribute('aria-hidden')).toBe('true');

    table.setSelection([{ startRow: 4, startCol: 0, endRow: 4, endCol: 0 }]);
    await frame();
    const active = root.getAttribute('aria-activedescendant');
    expect(active).toBeTruthy();
    expect(document.getElementById(active!)).toBe(cellAt(host, 4, 0));
  });
});

describe('auto layout virtualized by the page scroll', () => {
  let host: HTMLElement;
  let table: WanderTable;
  let containerTop = 0;
  const original = HTMLElement.prototype.getBoundingClientRect;

  beforeEach(async () => {
    stubLayout();
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.classList.contains('wt-scroll-container')) {
        return { top: containerTop, left: 0, right: VIEW_W, bottom: containerTop + 5000 * ROW_H, width: VIEW_W, height: 5000 * ROW_H, x: 0, y: containerTop, toJSON() {} } as DOMRect;
      }
      return original.call(this);
    };
    containerTop = 120;
    host = document.createElement('div');
    document.body.appendChild(host);
    table = new WanderTable(host, { layout: 'auto', virtualize: true, rowCount: 5000, colCount: 5, defaultRowHeight: ROW_H });
    for (let r = 0; r < 5000; r += 100) table.setCell(r, 0, { value: `r${r}` });
    await frame();
  });

  afterEach(() => {
    table.destroy();
    host.remove();
    HTMLElement.prototype.getBoundingClientRect = original;
  });

  it('renders only the rows inside the window, with no inner vertical scroll', () => {
    const rows = new Set(visibleCells(host).map((el) => Number(el.dataset.row)));
    expect(Math.max(...rows)).toBeLessThan(Math.ceil(400 / ROW_H) + 10);
    const sc = host.querySelector<HTMLElement>('.wt-scroll-container')!;
    expect(sc.style.overflowY).toBe('hidden');
    expect(host.querySelector<HTMLElement>('.wt-col-headers')!.style.position).toBe('sticky');
  });

  it('pins the column header below a host offset when stickyTop is set', async () => {
    const other = document.createElement('div');
    document.body.appendChild(other);
    const t = new WanderTable(other, { layout: 'auto', virtualize: true, rowCount: 10, colCount: 2, stickyTop: 'var(--bar, 48px)' });
    await frame();
    expect(other.querySelector<HTMLElement>('.wt-col-headers')!.style.top).toBe('var(--bar, 48px)');
    t.destroy();
    other.remove();
  });

  it('follows the window scroll', async () => {
    containerTop = -(ROW_H * 3000);
    window.dispatchEvent(new Event('scroll'));
    await frame();
    expect(cellAt(host, 3000, 0)?.textContent).toBe('r3000');
    expect(cellAt(host, 0, 0)).toBeUndefined();
  });
});

describe('setRowHeights', () => {
  it('applies many heights with one rebuild and repositions the rows below', async () => {
    stubLayout();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const table = new WanderTable(host, { rowCount: 100, colCount: 3, defaultRowHeight: ROW_H });
    table.setCell(3, 0, { value: 'below' });
    await frame();
    table.setRowHeights([[1, 80], [2, 60]]);
    await frame();
    expect(table.rows.getY(3)).toBe(ROW_H + 80 + 60);
    expect(cellAt(host, 3, 0)?.parentElement?.style.transform).toBe(`translateY(${ROW_H + 80 + 60}px)`);
    table.destroy();
    host.remove();
  });
});
