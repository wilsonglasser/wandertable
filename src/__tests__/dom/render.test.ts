// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WanderTable } from '../../WanderTable.js';
import type { CellData, CellSource } from '../../types/index.js';

const VIEW_W = 800;
const VIEW_H = 400;
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
  return [...root.querySelectorAll<HTMLElement>('.wt-cell')].filter((el) => el.style.display !== 'none' && el.dataset.row !== undefined);
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
