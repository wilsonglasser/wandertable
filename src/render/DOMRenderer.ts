import type { CellData, CellRenderer, CellSource, CellState, ThemeConfig, Viewport } from '../types/index.js';
import type { ColumnModel } from '../columns/ColumnModel.js';
import type { RowModel } from '../rows/RowModel.js';
import type { SelectionModel } from '../core/SelectionModel.js';
import type { ViewMapping } from '../core/ViewMapping.js';
import type { MergeModel } from '../core/MergeModel.js';
import { ColumnModel as CM } from '../columns/ColumnModel.js';
import { computeAutoRowHeight } from './autoRowHeight.js';

/**
 * Extra height added to the horizontal-scroll container in auto layout with
 * frozen columns, so the horizontal scrollbar at its bottom edge doesn't clip
 * the last row's bottom pixels. Just trailing whitespace when no scrollbar.
 */
const AUTO_SCROLLBAR_PAD = 16;

interface RendererContext {
  data: CellSource;
  columns: ColumnModel;
  rows: RowModel;
  selection: SelectionModel;
  viewMapping: ViewMapping;
  merges: MergeModel;
  theme: ThemeConfig;
  renderers: Map<string, CellRenderer>;
  defaultRenderer: CellRenderer;
  defaultCellType: string;
  showRowHeaders: boolean;
  showColHeaders: boolean;
  frozenRows: number;
  frozenCols: number;
  autoRowHeight: boolean;
  autoHeaderHeight: boolean;
  showGridLines: boolean;
  showBorder: boolean;
  preset?: string;
  layout: 'scroll' | 'auto';
  /** layout 'auto' only: render just the rows in view of the page (window) scroll. */
  virtualize?: boolean;
  /** CSS top of the sticky column header in virtualized auto layout (e.g. below a host toolbar). */
  stickyTop?: string;
  headerRows?: import('../columns/GroupedHeaders.js').HeaderCell[][];
  /** Accessible name for a cell (aria-label); null/undefined = use its text. */
  cellLabel?: (row: number, col: number, data: CellData | undefined) => string | null | undefined;
  /** Row header text; null/undefined = the 1-based row number. */
  rowHeaderLabel?: (row: number) => string | null | undefined;
}

/**
 * Pooled cell element with the cell it currently shows. A cell whose binding
 * is unchanged and not invalidated skips its content paint.
 */
interface CellEl extends HTMLElement {
  _wtRow?: number;
  _wtCol?: number;
  _wtRenderer?: CellRenderer;
}

/** Same stride as DataModel: dirty cells are tracked by row * stride + col. */
const DIRTY_STRIDE = 65536;
let gridUid = 0;

interface PooledRow {
  el: HTMLElement;
  cells: HTMLElement[];
  rowIndex: number;
}

export class DOMRenderer {
  private container: HTMLElement;
  private scrollContainer: HTMLElement;
  private scrollSentinel: HTMLElement;
  private viewportEl: HTMLElement;
  private colHeaderEl: HTMLElement;
  private rowHeaderEl: HTMLElement;
  private cornerEl: HTMLElement;

  private rowPool: PooledRow[] = [];
  private activeRows = new Map<number, PooledRow>();
  // Frozen columns live in their own CSS position:sticky layers (body + header)
  // so they pin horizontally via the browser compositor — smooth, no per-frame
  // JS transform — while scrolling vertically with the viewport.
  private frozenLayer!: HTMLElement;
  private frozenHeaderLayer: HTMLElement | null = null;
  private frozenRowPool: PooledRow[] = [];
  private activeFrozenRows = new Map<number, PooledRow>();
  private viewport: Viewport = { startRow: 0, endRow: 0, startCol: 0, endCol: 0, scrollX: 0, scrollY: 0 };
  private ctx!: RendererContext;

  private rafId = 0;
  private needsRender = false;
  /** Next paint repaints every visible cell's content (data/config/structure changed). */
  private contentDirtyAll = true;
  /** Cells whose content changed since the last paint (row * DIRTY_STRIDE + col). */
  private dirtyCells = new Set<number>();
  /** Data rows with at least one cell content painted in the current frame. */
  private paintedRows = new Set<number>();
  private readonly uid = ++gridUid;
  private cellSeq = 0;
  /** Measured header height when autoHeaderHeight is on (null = use theme). */
  private measuredHeaderHeight: number | null = null;

  onScroll: ((viewport: Viewport) => void) | null = null;
  onCellClick: ((row: number, col: number, event: MouseEvent) => void) | null = null;
  onCellDblClick: ((row: number, col: number, event: MouseEvent) => void) | null = null;
  onCellContextMenu: ((row: number, col: number, event: MouseEvent) => void) | null = null;
  onHeaderClick: ((type: 'col' | 'row' | 'corner', index: number, event: MouseEvent) => void) | null = null;
  onColumnResizeStart: ((col: number, startX: number) => void) | null = null;
  onHeaderContextMenu: ((type: 'col' | 'row', index: number, event: MouseEvent) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.classList.add('wt-root');
    this.container.setAttribute('tabindex', '0');
    this.container.setAttribute('role', 'grid');
    this.container.setAttribute('aria-multiselectable', 'true');

    // Corner cell
    this.cornerEl = document.createElement('div');
    this.cornerEl.className = 'wt-corner';
    this.cornerEl.setAttribute('aria-hidden', 'true');

    // Column headers
    this.colHeaderEl = document.createElement('div');
    this.colHeaderEl.className = 'wt-col-headers';

    // Row headers
    this.rowHeaderEl = document.createElement('div');
    this.rowHeaderEl.className = 'wt-row-headers';
    // Row numbers are visual only: the grid exposes aria-rowindex on each row.
    this.rowHeaderEl.setAttribute('aria-hidden', 'true');

    // Scroll container (native scrollbar)
    this.scrollContainer = document.createElement('div');
    this.scrollContainer.className = 'wt-scroll-container';

    // Sentinel (gives the scroll container its full size)
    this.scrollSentinel = document.createElement('div');
    this.scrollSentinel.className = 'wt-scroll-sentinel';

    // Viewport (holds visible rows)
    this.viewportEl = document.createElement('div');
    this.viewportEl.className = 'wt-viewport';

    // Sticky layer for frozen columns (pins horizontally, scrolls vertically).
    // Child of the scroll-container so its sticky containing block spans the
    // full scroll width (a viewport child only spans the client width and would
    // unstick once scrolled past it).
    this.frozenLayer = document.createElement('div');
    this.frozenLayer.className = 'wt-frozen-layer';
    this.frozenLayer.style.display = 'none';

    this.scrollContainer.appendChild(this.scrollSentinel);
    this.scrollContainer.appendChild(this.viewportEl);
    this.scrollContainer.appendChild(this.frozenLayer);

    this.container.appendChild(this.cornerEl);
    this.container.appendChild(this.colHeaderEl);
    this.container.appendChild(this.rowHeaderEl);
    this.container.appendChild(this.scrollContainer);

    this.scrollContainer.addEventListener('scroll', this.handleScroll, { passive: true });
    window.addEventListener('scroll', this.handlePageScroll, { passive: true });
    window.addEventListener('resize', this.handlePageScroll, { passive: true });
    this.viewportEl.addEventListener('mousedown', this.handleMouseDown);
    this.viewportEl.addEventListener('dblclick', this.handleDblClick);
    this.viewportEl.addEventListener('contextmenu', this.handleContextMenu);
    // Frozen layer mirrors the viewport interactions (it lives outside viewport).
    this.frozenLayer.addEventListener('mousedown', this.handleMouseDown);
    this.frozenLayer.addEventListener('dblclick', this.handleDblClick);
    this.frozenLayer.addEventListener('contextmenu', this.handleContextMenu);
    this.colHeaderEl.addEventListener('mousedown', this.handleColHeaderMouse);
    this.colHeaderEl.addEventListener('contextmenu', this.handleColHeaderContextMenu);
    this.rowHeaderEl.addEventListener('mousedown', this.handleRowHeaderMouse);
    this.rowHeaderEl.addEventListener('contextmenu', this.handleRowHeaderContextMenu);
    this.cornerEl.addEventListener('mousedown', this.handleCornerMouse);
  }

  init(ctx: RendererContext): void {
    this.ctx = ctx;
    this.container.classList.toggle('wt-root--no-gridlines', !ctx.showGridLines);
    this.container.classList.toggle('wt-root--no-border', !ctx.showBorder);
    this.container.classList.toggle('wt-root--preset-standard', ctx.preset === 'standard');
    this.container.classList.toggle('wt-root--preset-invisible', ctx.preset === 'invisible');
    this.container.classList.toggle('wt-root--auto-header', ctx.autoHeaderHeight);
    this.container.classList.toggle('wt-root--auto-row', ctx.autoRowHeight);
    if (ctx.layout === 'auto') {
      this.container.classList.add('wt-root--auto');
      this.scrollContainer.classList.add('wt-scroll-container--auto');
    }
    this.applyTheme();
    this.measureHeaderHeight();
    this.updateLayout();
    this.scheduleRender();
  }

  /**
   * Measure the tallest wrapped header label across ALL columns once (not per
   * scroll frame) and grow the header to fit. Only runs when autoHeaderHeight is
   * on. Uses a hidden probe so it doesn't disturb the rendered headers.
   */
  measureHeaderHeight(): void {
    if (!this.ctx.autoHeaderHeight || !this.ctx.showColHeaders) return;
    const { columns, theme } = this.ctx;
    const innerDiv = this.colHeaderEl.querySelector('.wt-col-headers-inner') as HTMLElement
      ?? this.createColHeadersInner();

    const probe = document.createElement('div');
    probe.className = 'wt-header-cell wt-col-header-cell';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.height = 'auto';
    probe.style.transform = 'translateX(-99999px)';
    innerDiv.appendChild(probe);

    let maxH = theme.headerHeight!;
    for (let col = 0; col < columns.count; col++) {
      probe.style.width = `${columns.getWidth(col)}px`;
      probe.textContent = columns.getConfig(col)?.label ?? CM.columnLabel(col);
      if (probe.scrollHeight > maxH) maxH = probe.scrollHeight;
    }
    innerDiv.removeChild(probe);

    maxH = Math.min(maxH, 200);
    if (this.measuredHeaderHeight !== maxH) {
      this.measuredHeaderHeight = maxH;
      this.updateLayout();
    }
  }

  private applyTheme(): void {
    const t = this.ctx.theme;
    const s = this.container.style;
    s.setProperty('--wt-bg', t.bgColor!);
    s.setProperty('--wt-cell-bg', t.cellBgColor!);
    s.setProperty('--wt-cell-text', t.cellTextColor!);
    s.setProperty('--wt-header-bg', t.headerBgColor!);
    s.setProperty('--wt-header-text', t.headerTextColor!);
    s.setProperty('--wt-grid-line', t.gridLineColor!);
    s.setProperty('--wt-sel-bg', t.selectionBgColor!);
    s.setProperty('--wt-sel-border', t.selectionBorderColor!);
    s.setProperty('--wt-focus-border', t.focusBorderColor!);
    s.setProperty('--wt-font', t.fontFamily!);
    s.setProperty('--wt-font-size', `${t.fontSize}px`);
    s.setProperty('--wt-header-font-size', `${t.headerFontSize}px`);
    s.setProperty('--wt-cell-padding', `${t.cellPadding}px`);
    s.setProperty('--wt-header-height', `${t.headerHeight}px`);
    s.setProperty('--wt-row-header-width', `${t.rowHeaderWidth}px`);
  }

  updateLayout(): void {
    const { columns, rows, viewMapping, showColHeaders, showRowHeaders, theme } = this.ctx;
    const totalW = columns.getTotalWidth();
    const visibleRows = viewMapping.visibleRowCount;
    const totalH = visibleRows === rows.count
      ? rows.getTotalHeight()
      : rows.getY(visibleRows);

    const headerLevels = this.ctx.headerRows ? this.ctx.headerRows.length : 1;
    const baseHeaderH = (this.ctx.autoHeaderHeight && this.measuredHeaderHeight)
      ? this.measuredHeaderHeight
      : theme.headerHeight! * headerLevels;
    const headerH = showColHeaders ? baseHeaderH : 0;
    const headerW = showRowHeaders ? theme.rowHeaderWidth! : 0;

    if (this.ctx.layout === 'auto') {
      // Auto layout: CSS grid, content determines size. Shared chrome setup; the
      // body/scroll wiring then forks on whether there are frozen columns.
      const frozenCols = this.ctx.frozenCols;
      this.container.style.display = 'grid';
      this.container.style.gridTemplateRows = `${headerH}px auto`;

      this.cornerEl.style.display = (showColHeaders && showRowHeaders) ? '' : 'none';
      this.cornerEl.style.position = 'static';
      this.cornerEl.style.width = '';
      this.cornerEl.style.height = '';

      this.colHeaderEl.style.display = showColHeaders ? '' : 'none';
      this.colHeaderEl.style.position = 'static';
      this.colHeaderEl.style.left = '';
      this.colHeaderEl.style.right = '';
      this.colHeaderEl.style.height = `${headerH}px`;

      this.rowHeaderEl.style.display = showRowHeaders ? '' : 'none';
      this.rowHeaderEl.style.position = 'static';
      this.rowHeaderEl.style.top = '';
      this.rowHeaderEl.style.bottom = '';
      this.rowHeaderEl.style.width = `${headerW}px`;

      this.scrollSentinel.style.width = `${totalW}px`;
      this.scrollSentinel.style.height = '0';

      if (frozenCols > 0 || this.ctx.virtualize) {
        // Frozen (or virtualized) + auto: the grid fills its parent width and the body column is
        // constrained with minmax(0, 1fr) — NOT `${totalW}px` or `1fr` — so the
        // answer columns scroll HORIZONTALLY inside the grid while the frozen
        // layer pins sticky-left. The PAGE owns vertical scroll: the scroll
        // container is exactly content-tall (plus a scrollbar pad) with
        // overflow-y:hidden, so it never shows an inner vertical scrollbar, and
        // its overflow-x:auto establishes the containing block the frozen
        // position:sticky layer needs.
        this.container.style.gridTemplateColumns = `${headerW}px minmax(0, 1fr)`;
        this.container.style.width = '100%';
        this.container.style.minWidth = '';

        // Header clips + syncs horizontally (programmatic scrollLeft needs a
        // non-visible overflow; the frozen header layer sticks within it).
        this.colHeaderEl.style.overflow = 'hidden';
        this.colHeaderEl.style.gridRow = '1';
        this.colHeaderEl.style.gridColumn = showRowHeaders ? '2' : '1 / -1';
        if (this.ctx.virtualize) {
          // Page scroll: the column headers (and the corner) stay at the top.
          for (const el of [this.colHeaderEl, this.cornerEl]) {
            el.style.position = 'sticky';
            el.style.top = this.ctx.stickyTop ?? '0';
            el.style.zIndex = '6';
          }
        }

        // Row headers don't scroll internally (page owns vertical scroll).
        this.rowHeaderEl.style.overflow = 'visible';
        this.rowHeaderEl.style.height = `${totalH}px`;
        this.rowHeaderEl.style.gridRow = '2';
        this.rowHeaderEl.style.gridColumn = '1';

        this.scrollContainer.style.position = 'relative';
        this.scrollContainer.style.top = '';
        this.scrollContainer.style.left = '';
        this.scrollContainer.style.right = '';
        this.scrollContainer.style.bottom = '';
        this.scrollContainer.style.overflowX = 'auto';
        this.scrollContainer.style.overflowY = 'hidden';
        this.scrollContainer.style.height = `${totalH + AUTO_SCROLLBAR_PAD}px`;
        this.scrollContainer.style.gridRow = '2';
        this.scrollContainer.style.gridColumn = showRowHeaders ? '2' : '1 / -1';

        // Viewport absolute so the in-flow sticky frozen layer is the sole
        // in-flow child and pins at the top of the scrollport.
        this.viewportEl.style.position = 'absolute';
        this.viewportEl.style.height = `${totalH}px`;
        this.viewportEl.style.width = `${totalW}px`;

        if (showRowHeaders) {
          const innerDiv = this.rowHeaderEl.querySelector('.wt-row-headers-inner') as HTMLElement | null;
          if (innerDiv) innerDiv.style.height = `${totalH}px`;
        }
      } else {
        // Auto, no frozen columns: content determines size in both axes, the page
        // scrolls both directions, the grid grows to its full content width.
        this.container.style.gridTemplateColumns = `${headerW}px ${totalW}px`;
        this.container.style.width = `${headerW + totalW}px`;
        this.container.style.minWidth = '100%';

        this.colHeaderEl.style.overflow = 'visible';

        this.rowHeaderEl.style.overflow = 'visible';

        this.scrollContainer.style.position = 'static';
        this.scrollContainer.style.top = '';
        this.scrollContainer.style.left = '';
        this.scrollContainer.style.right = '';
        this.scrollContainer.style.bottom = '';
        this.scrollContainer.style.overflow = 'visible';
        this.scrollContainer.style.height = '';
        this.scrollContainer.style.gridColumn = showRowHeaders ? '2' : '1 / -1';

        this.viewportEl.style.position = 'relative';
        this.viewportEl.style.height = `${totalH}px`;
        this.viewportEl.style.width = `${totalW}px`;

        if (showRowHeaders) {
          const innerDiv = this.rowHeaderEl.querySelector('.wt-row-headers-inner') as HTMLElement;
          if (innerDiv) innerDiv.style.height = `${totalH}px`;
          this.rowHeaderEl.style.height = `${totalH}px`;
          this.rowHeaderEl.style.gridRow = '2';
          this.rowHeaderEl.style.gridColumn = '1';
        }
      }
    } else {
      // Scroll layout: absolute positioning (original)
      this.scrollSentinel.style.width = `${totalW}px`;
      this.scrollSentinel.style.height = `${totalH}px`;

      this.cornerEl.style.display = (showColHeaders && showRowHeaders) ? '' : 'none';
      this.cornerEl.style.width = `${headerW}px`;
      this.cornerEl.style.height = `${headerH}px`;

      this.colHeaderEl.style.display = showColHeaders ? '' : 'none';
      this.colHeaderEl.style.left = `${headerW}px`;
      this.colHeaderEl.style.height = `${headerH}px`;
      this.colHeaderEl.style.right = '0';

      this.rowHeaderEl.style.display = showRowHeaders ? '' : 'none';
      this.rowHeaderEl.style.top = `${headerH}px`;
      this.rowHeaderEl.style.width = `${headerW}px`;
      this.rowHeaderEl.style.bottom = '0';

      this.scrollContainer.style.top = `${headerH}px`;
      this.scrollContainer.style.left = `${headerW}px`;
      this.scrollContainer.style.right = '0';
      this.scrollContainer.style.bottom = '0';
    }
  }

  /** Full repaint: every visible cell's content is painted again. */
  scheduleRender(): void {
    this.contentDirtyAll = true;
    this.schedulePaint();
  }

  /**
   * Light repaint (scroll, selection): positions and state are refreshed, but a
   * cell's content is painted only when it shows a different cell than before
   * or was invalidated.
   */
  schedulePaint(): void {
    if (this.needsRender) return;
    this.needsRender = true;
    this.rafId = requestAnimationFrame(() => {
      this.needsRender = false;
      this.render();
      this.contentDirtyAll = false;
      this.dirtyCells.clear();
    });
  }

  /** Repaint just these cells' content on the next frame. */
  invalidateCells(cells: Iterable<{ row: number; col: number }>): void {
    for (const c of cells) this.dirtyCells.add(c.row * DIRTY_STRIDE + c.col);
    this.schedulePaint();
  }

  private render(): void {
    const { columns, rows, viewMapping, showColHeaders, showRowHeaders } = this.ctx;
    const sc = this.scrollContainer;
    const containerW = sc.clientWidth;
    const containerH = sc.clientHeight;
    const scrollX = sc.scrollLeft;
    const scrollY = sc.scrollTop;

    const totalVisibleRows = viewMapping.visibleRowCount;
    const isAutoLayout = this.ctx.layout === 'auto';

    // Inline viewport calculation
    const overscan = 3;

    let vpStartRow: number, vpEndRow: number, vpStartCol: number, vpEndCol: number;

    if (isAutoLayout && this.ctx.virtualize) {
      // The page scrolls vertically: what is in view is where the window cuts
      // the body. Columns still scroll inside the scroll container.
      const pageTop = Math.max(0, -sc.getBoundingClientRect().top);
      const pageH = window.innerHeight;
      const pageOverscan = 6;
      vpStartRow = Math.max(0, rows.getRowAtY(pageTop) - pageOverscan);
      vpEndRow = Math.min(totalVisibleRows - 1, rows.getRowAtY(pageTop + pageH) + pageOverscan);
      vpStartCol = Math.max(0, columns.getColAtX(scrollX) - overscan);
      vpEndCol = Math.min(columns.count - 1, columns.getColAtX(scrollX + containerW) + overscan);
    } else if (isAutoLayout) {
      // Auto layout: render all rows and columns
      vpStartRow = 0;
      vpEndRow = totalVisibleRows - 1;
      vpStartCol = 0;
      vpEndCol = columns.count - 1;
    } else {
      const rawStartRow = rows.getRowAtY(scrollY);
      const rawEndRow = rows.getRowAtY(scrollY + containerH);
      const rawStartCol = columns.getColAtX(scrollX);
      const rawEndCol = columns.getColAtX(scrollX + containerW);
      vpStartRow = Math.max(0, rawStartRow - overscan);
      vpEndRow = Math.min(totalVisibleRows - 1, rawEndRow + overscan);
      vpStartCol = Math.max(0, rawStartCol - overscan);
      vpEndCol = Math.min(columns.count - 1, rawEndCol + overscan);
    }

    const vp: Viewport = {
      startRow: vpStartRow,
      endRow: vpEndRow,
      startCol: vpStartCol,
      endCol: vpEndCol,
      scrollX,
      scrollY,
    };

    this.viewport = vp;

    const frozenRows = this.ctx.frozenRows;
    const frozenCols = this.ctx.frozenCols;

    // Determine which rows to render: frozen + viewport
    const visibleSet = new Set<number>();
    // Always include frozen rows
    for (let r = 0; r < frozenRows && r < totalVisibleRows; r++) {
      visibleSet.add(r);
    }
    // Viewport rows
    for (let r = vp.startRow; r <= vp.endRow; r++) {
      visibleSet.add(r);
    }

    // Recycle rows that left
    for (const [rowIdx, pooled] of this.activeRows) {
      if (!visibleSet.has(rowIdx)) {
        pooled.el.style.display = 'none';
        for (const cellEl of pooled.cells) this.unbindCell(cellEl);
        this.rowPool.push(pooled);
        this.activeRows.delete(rowIdx);
      }
    }

    this.updateGridAria();

    // Render all needed rows
    this.focusedCellEl = null;
    this.paintedRows.clear();
    for (const r of visibleSet) {
      this.renderRow(r, vp, scrollY, frozenRows, frozenCols);
    }

    // Frozen columns in their own sticky layer.
    this.renderFrozenColumns(visibleSet, scrollY, frozenRows);

    // Auto row height: measure actual cell content and adjust. Both the main
    // (scrolling) row and the frozen sticky row contribute to the row height —
    // the tallest cell across BOTH pools wins, and the measured height is then
    // applied to both so the frozen columns stay aligned with the body.
    // Only rows whose content was painted this frame can have changed height:
    // scroll, selection and untouched rows keep their measured height.
    if (this.ctx.autoRowHeight && this.paintedRows.size > 0) {
      // Switch every auto-row cell to top-alignment for the whole read pass via a
      // single class on the root (one style write → reads collapse into one
      // reflow, instead of thrashing one reflow per cell). Restored right after so
      // the cells display centered. Top-alignment is required for an accurate
      // scrollHeight: centered wrapped content overflows above the top edge and
      // gets clipped, under-measuring the row.
      this.container.classList.add('wt-measuring');
      let layoutChanged = false;
      for (const r of visibleSet) {
        if (!this.paintedRows.has(viewMapping.toDataRow(r))) continue;
        const heights: number[] = [];
        const mainPooled = this.activeRows.get(r);
        if (mainPooled) {
          for (const cellEl of mainPooled.cells) {
            if (cellEl.style.display === 'none') continue;
            heights.push(cellEl.scrollHeight);
          }
        }
        const frozenPooled = this.activeFrozenRows.get(r);
        if (frozenPooled) {
          for (const cellEl of frozenPooled.cells) {
            if (cellEl.style.display === 'none') continue;
            heights.push(cellEl.scrollHeight);
          }
        }
        const maxH = computeAutoRowHeight(heights, 20);
        const currentH = rows.getHeight(r);
        if (Math.abs(maxH - currentH) > 1) {
          rows.setHeight(r, maxH);
          layoutChanged = true;
        }
      }
      this.container.classList.remove('wt-measuring');
      if (layoutChanged) {
        // Re-position rows with updated heights (without recursing). The frozen
        // layer's own height also needs to grow so the freeze line spans the new
        // total height.
        this.updateLayout();
        const visibleRows = viewMapping.visibleRowCount;
        const newTotalH = visibleRows === rows.count ? rows.getTotalHeight() : rows.getY(visibleRows);
        if (frozenCols > 0) this.frozenLayer.style.height = `${newTotalH}px`;
        for (const r of visibleSet) {
          const isFr = r < frozenRows;
          const newY = isFr ? rows.getY(r) + scrollY : rows.getY(r);
          const newH = rows.getHeight(r);
          const mainPooled = this.activeRows.get(r);
          if (mainPooled) {
            mainPooled.el.style.transform = `translateY(${newY}px)`;
            mainPooled.el.style.height = `${newH}px`;
            for (const cellEl of mainPooled.cells) {
              if (cellEl.style.display !== 'none') cellEl.style.height = `${newH}px`;
            }
          }
          const frozenPooled = this.activeFrozenRows.get(r);
          if (frozenPooled) {
            frozenPooled.el.style.transform = `translateY(${newY}px)`;
            frozenPooled.el.style.height = `${newH}px`;
            for (const cellEl of frozenPooled.cells) {
              if (cellEl.style.display !== 'none') cellEl.style.height = `${newH}px`;
            }
          }
        }
      }
    }

    this.updateActiveDescendant();

    // Render headers
    if (showColHeaders) this.renderColHeaders(vp, scrollX);
    if (showRowHeaders) this.renderRowHeaders(vp, scrollY);

    this.onScroll?.(vp);
  }

  private renderRow(
    rowIndex: number,
    vp: Viewport,
    scrollY: number,
    frozenRows: number,
    frozenCols: number,
  ): void {
    const { columns, rows, viewMapping } = this.ctx;
    const dataRow = viewMapping.toDataRow(rowIndex);
    let pooled = this.activeRows.get(rowIndex);
    const y = rows.getY(rowIndex);
    const h = rows.getHeight(rowIndex);
    // Frozen columns render in a separate sticky layer (renderFrozenColumns),
    // so the main row renders only the non-frozen viewport columns.
    const renderCols: number[] = [];
    for (let c = vp.startCol; c <= vp.endCol; c++) {
      if (c >= frozenCols) renderCols.push(c);
    }
    const colCount = renderCols.length;

    const isFrozenRow = rowIndex < frozenRows;

    if (!pooled) {
      pooled = this.acquireRow(colCount);
      pooled.rowIndex = rowIndex;
      this.activeRows.set(rowIndex, pooled);
    }

    // Position the row - frozen rows stick to top via scroll compensation
    const el = pooled.el;
    el.style.display = '';
    const rowY = isFrozenRow ? y + scrollY : y;
    el.style.transform = `translateY(${rowY}px)`;
    el.style.height = `${h}px`;
    el.style.zIndex = isFrozenRow ? '2' : '';
    el.dataset.row = String(dataRow);
    el.setAttribute('aria-rowindex', String(this.ariaRowIndex(dataRow)));

    // Ensure correct number of cells
    this.ensureCells(pooled, colCount);

    // Render each cell
    const { merges } = this.ctx;
    for (let ci = 0; ci < colCount; ci++) {
      const col = renderCols[ci];
      const cellEl = pooled.cells[ci];

      // Skip cells hidden by a merge
      if (merges.isHidden(dataRow, col)) {
        cellEl.style.display = 'none';
        this.unbindCell(cellEl);
        continue;
      }

      const x = columns.getX(col);
      let w = columns.getWidth(col);
      let cellH = h;

      // If this cell is a merge anchor, expand its width/height
      const merge = merges.getMerge(dataRow, col);
      if (merge && merge.row === dataRow && merge.col === col) {
        for (let mc = 1; mc < merge.colSpan; mc++) {
          w += columns.getWidth(col + mc);
        }
        for (let mr = 1; mr < merge.rowSpan; mr++) {
          cellH += rows.getHeight(rowIndex + mr);
        }
        cellEl.style.zIndex = '1';
      } else {
        cellEl.style.zIndex = '';
      }

      cellEl.style.transform = `translateX(${x}px)`;
      cellEl.style.width = `${w}px`;
      cellEl.style.height = `${cellH}px`;
      cellEl.style.display = '';
      if (isFrozenRow) {
        cellEl.style.zIndex = '3';
      }
      cellEl.dataset.row = String(dataRow);
      cellEl.dataset.col = String(col);

      this.renderCellContent(cellEl, dataRow, col);
    }

    // Hide extra cells
    for (let ci = colCount; ci < pooled.cells.length; ci++) {
      pooled.cells[ci].style.display = 'none';
      this.unbindCell(pooled.cells[ci]);
    }
  }

  /**
   * Cell state, and content when needed — shared by main rows and the frozen
   * layer. Content (style, class, renderer) is painted only when the element
   * now shows a different cell, or that cell was invalidated.
   */
  private renderCellContent(el: HTMLElement, dataRow: number, col: number): void {
    const cellEl = el as CellEl;
    const { data, selection } = this.ctx;
    const selected = selection.isSelected(dataRow, col);
    const focused = selection.isFocused(dataRow, col);
    const bound = cellEl._wtRow === dataRow && cellEl._wtCol === col;

    if (!bound || this.contentDirtyAll || this.dirtyCells.has(dataRow * DIRTY_STRIDE + col)) {
      this.paintCellContent(cellEl, dataRow, col, data.getCell(dataRow, col), { selected, focused, editing: false, hover: false });
    }

    cellEl.classList.toggle('wt-cell--selected', selected);
    cellEl.classList.toggle('wt-cell--focused', focused);
    if (cellEl.getAttribute('aria-selected') !== (selected ? 'true' : 'false')) {
      cellEl.setAttribute('aria-selected', selected ? 'true' : 'false');
    }
    if (focused) this.focusedCellEl = cellEl;
  }

  private paintCellContent(cellEl: CellEl, dataRow: number, col: number, cellData: CellData | undefined, state: CellState): void {
    this.paintedRows.add(dataRow);
    cellEl._wtRenderer?.cleanup?.(cellEl);
    cellEl._wtRow = dataRow;
    cellEl._wtCol = col;

    // Reset the class every paint: a recycled element must not keep the
    // previous cell's custom class.
    cellEl.className = cellData?.className ? `wt-cell ${cellData.className}` : 'wt-cell';

    if (cellData?.style) {
      const cs = cellData.style;
      cellEl.style.backgroundColor = cs.bgColor ?? '';
      cellEl.style.color = cs.textColor ?? '';
      cellEl.style.textAlign = cs.textAlign ?? '';
      cellEl.style.borderLeft = cs.borderLeft ?? '';
      cellEl.style.borderRight = cs.borderRight ?? '';
      cellEl.style.borderTop = cs.borderTop ?? '';
      cellEl.style.borderBottom = cs.borderBottom ?? '';
    } else {
      cellEl.style.backgroundColor = '';
      cellEl.style.color = '';
      cellEl.style.textAlign = '';
      cellEl.style.borderLeft = '';
      cellEl.style.borderRight = '';
      cellEl.style.borderTop = '';
      cellEl.style.borderBottom = '';
    }

    // Column alignment → flex justify (cells are flex; text-align alone does not
    // move a single content node). Per-cell style.textAlign still wins for text.
    const colAlign = this.ctx.columns.getConfig(col)?.align;
    cellEl.style.justifyContent =
      colAlign === 'center' ? 'center' : colAlign === 'right' ? 'flex-end' : '';
    if (colAlign && !cellData?.style?.textAlign) {
      cellEl.style.textAlign = colAlign;
    }

    cellEl.setAttribute('aria-colindex', String(this.ariaColIndex(col)));
    const readOnly = cellData?.readOnly ?? this.ctx.columns.getConfig(col)?.readOnly;
    if (readOnly) {
      cellEl.setAttribute('aria-readonly', 'true');
    } else {
      cellEl.removeAttribute('aria-readonly');
    }
    const label = this.ctx.cellLabel?.(dataRow, col, cellData);
    if (label) {
      cellEl.setAttribute('aria-label', label);
    } else {
      cellEl.removeAttribute('aria-label');
    }

    const type = cellData?.type ?? this.ctx.columns.getConfig(col)?.type ?? this.ctx.defaultCellType;
    const renderer = this.ctx.renderers.get(type) ?? this.ctx.defaultRenderer;
    renderer.render(cellEl, cellData, state);
    cellEl._wtRenderer = renderer;
  }

  /** Forget what a hidden/recycled element showed, so it repaints when reused. */
  private unbindCell(el: HTMLElement): void {
    const cellEl = el as CellEl;
    cellEl._wtRow = undefined;
    cellEl._wtCol = undefined;
  }

  private focusedCellEl: HTMLElement | null = null;

  private ariaRowIndex(dataRow: number): number {
    return dataRow + 1 + (this.ctx.showColHeaders ? 1 : 0);
  }

  private ariaColIndex(col: number): number {
    return col + 1;
  }

  private updateGridAria(): void {
    const rowCount = String(this.ctx.data.rowCount + (this.ctx.showColHeaders ? 1 : 0));
    const colCount = String(this.ctx.columns.count);
    if (this.container.getAttribute('aria-rowcount') !== rowCount) this.container.setAttribute('aria-rowcount', rowCount);
    if (this.container.getAttribute('aria-colcount') !== colCount) this.container.setAttribute('aria-colcount', colCount);
  }

  /** Point aria-activedescendant at the focused cell, if it is rendered. */
  private updateActiveDescendant(): void {
    const el = this.focusedCellEl;
    if (el && el.isConnected && el.style.display !== 'none') {
      if (!el.id) el.id = `wt${this.uid}-c${++this.cellSeq}`;
      this.container.setAttribute('aria-activedescendant', el.id);
    } else {
      this.container.removeAttribute('aria-activedescendant');
    }
  }

  /** Render the frozen columns into the sticky layer (pinned horizontally). */
  private renderFrozenColumns(visibleSet: Set<number>, scrollY: number, frozenRows: number): void {
    const frozenCols = this.ctx.frozenCols;
    if (frozenCols <= 0) {
      this.frozenLayer.style.display = 'none';
      return;
    }
    const { columns, rows, viewMapping } = this.ctx;

    let frozenWidth = 0;
    for (let c = 0; c < frozenCols; c++) frozenWidth += columns.getWidth(c);
    const visibleRows = viewMapping.visibleRowCount;
    const totalH = visibleRows === rows.count ? rows.getTotalHeight() : rows.getY(visibleRows);
    this.frozenLayer.style.display = '';
    this.frozenLayer.style.width = `${frozenWidth}px`;
    this.frozenLayer.style.height = `${totalH}px`;

    // Recycle frozen rows that left the viewport.
    for (const [rowIdx, pooled] of this.activeFrozenRows) {
      if (!visibleSet.has(rowIdx)) {
        pooled.el.style.display = 'none';
        for (const cellEl of pooled.cells) this.unbindCell(cellEl);
        this.frozenRowPool.push(pooled);
        this.activeFrozenRows.delete(rowIdx);
      }
    }

    const { merges } = this.ctx;
    for (const rowIndex of visibleSet) {
      const dataRow = viewMapping.toDataRow(rowIndex);
      let pooled = this.activeFrozenRows.get(rowIndex);
      const y = rows.getY(rowIndex);
      const h = rows.getHeight(rowIndex);
      const isFrozenRow = rowIndex < frozenRows;

      if (!pooled) {
        pooled = this.acquireFrozenRow(frozenCols);
        pooled.rowIndex = rowIndex;
        this.activeFrozenRows.set(rowIndex, pooled);
      }

      const el = pooled.el;
      el.style.display = '';
      el.style.transform = `translateY(${isFrozenRow ? y + scrollY : y}px)`;
      el.style.height = `${h}px`;
      el.style.zIndex = isFrozenRow ? '2' : '';
      el.dataset.row = String(dataRow);
      el.setAttribute('aria-rowindex', String(this.ariaRowIndex(dataRow)));

      this.ensureFrozenCells(pooled, frozenCols);
      for (let col = 0; col < frozenCols; col++) {
        const cellEl = pooled.cells[col];
        if (merges.isHidden(dataRow, col)) {
          cellEl.style.display = 'none';
          this.unbindCell(cellEl);
          continue;
        }
        cellEl.style.transform = `translateX(${columns.getX(col)}px)`;
        cellEl.style.width = `${columns.getWidth(col)}px`;
        cellEl.style.height = `${h}px`;
        cellEl.style.display = '';
        cellEl.style.zIndex = '';
        cellEl.dataset.row = String(dataRow);
        cellEl.dataset.col = String(col);
        this.renderCellContent(cellEl, dataRow, col);
      }
      for (let ci = frozenCols; ci < pooled.cells.length; ci++) {
        pooled.cells[ci].style.display = 'none';
      }
    }
  }

  private acquireFrozenRow(cellCount: number): PooledRow {
    let pooled = this.frozenRowPool.pop();
    if (!pooled) {
      const el = document.createElement('div');
      el.className = 'wt-row wt-frozen-row';
      el.setAttribute('role', 'row');
      this.frozenLayer.appendChild(el);
      pooled = { el, cells: [], rowIndex: -1 };
    }
    this.ensureFrozenCells(pooled, cellCount);
    return pooled;
  }

  private ensureFrozenCells(pooled: PooledRow, count: number): void {
    while (pooled.cells.length < count) {
      const cell = document.createElement('div');
      cell.className = 'wt-cell';
      cell.setAttribute('role', 'gridcell');
      pooled.el.appendChild(cell);
      pooled.cells.push(cell);
    }
  }

  private lastHeaderScrollX = -1;

  private renderColHeaders(vp: Viewport, scrollX: number): void {
    const { columns, theme } = this.ctx;
    const headerRows = this.ctx.headerRows;

    // Sync scroll with data area. Writing scrollLeft forces a synchronous
    // layout, so only touch it when the horizontal offset actually changed.
    if (this.lastHeaderScrollX !== scrollX) {
      this.colHeaderEl.scrollLeft = scrollX;
      this.lastHeaderScrollX = scrollX;
    }

    const innerDiv = this.colHeaderEl.querySelector('.wt-col-headers-inner') as HTMLElement
      ?? this.createColHeadersInner();

    innerDiv.style.width = `${columns.getTotalWidth()}px`;

    if (headerRows && headerRows.length > 1) {
      // Grouped headers: render multi-level
      const rowH = theme.headerHeight!;
      const totalH = rowH * headerRows.length;
      this.colHeaderEl.style.height = `${totalH}px`;
      innerDiv.style.height = `${totalH}px`;
      innerDiv.innerHTML = '';

      for (let level = 0; level < headerRows.length; level++) {
        for (const hc of headerRows[level]) {
          const cell = document.createElement('div');
          cell.className = hc.colSpan > 1
            ? 'wt-header-cell wt-col-header-group'
            : 'wt-header-cell wt-col-header-cell';
          const x = columns.getX(hc.col);
          let w = 0;
          for (let c = 0; c < hc.colSpan; c++) {
            w += columns.getWidth(hc.col + c);
          }
          cell.style.transform = `translate(${x}px, ${level * rowH}px)`;
          cell.style.width = `${w}px`;
          cell.style.height = `${rowH * hc.rowSpan}px`;
          cell.textContent = hc.label;
          if (hc.colSpan === 1) {
            cell.dataset.col = String(hc.col);
          }
          innerDiv.appendChild(cell);
        }
      }
    } else {
      // Simple single-row headers. Non-frozen columns scroll in the inner;
      // frozen columns live in a sticky header layer (pinned, matches the body).
      const frozenCols = this.ctx.frozenCols;
      const headerH = (this.ctx.autoHeaderHeight && this.measuredHeaderHeight)
        ? this.measuredHeaderHeight
        : theme.headerHeight!;

      const cols: number[] = [];
      for (let c = vp.startCol; c <= vp.endCol; c++) {
        if (c >= frozenCols) cols.push(c);
      }
      const needed = cols.length;
      while (innerDiv.children.length < needed) {
        const cell = document.createElement('div');
        cell.className = 'wt-header-cell wt-col-header-cell';
        innerDiv.appendChild(cell);
      }
      for (let i = 0; i < needed; i++) {
        this.styleHeaderCell(innerDiv.children[i] as HTMLElement, cols[i], headerH);
      }
      for (let i = needed; i < innerDiv.children.length; i++) {
        (innerDiv.children[i] as HTMLElement).style.display = 'none';
      }

      if (frozenCols > 0) {
        const layer = this.ensureFrozenHeaderLayer();
        layer.style.display = '';
        let fw = 0;
        for (let c = 0; c < frozenCols; c++) fw += columns.getWidth(c);
        layer.style.width = `${fw}px`;
        layer.style.height = `${headerH}px`;
        // The inner header div is in-flow (relative) and fills the header height,
        // so the sticky layer would land below it; pull it back up to overlap.
        layer.style.marginTop = `-${headerH}px`;
        while (layer.children.length < frozenCols) {
          const cell = document.createElement('div');
          cell.className = 'wt-header-cell wt-col-header-cell';
          layer.appendChild(cell);
        }
        for (let c = 0; c < frozenCols; c++) {
          this.styleHeaderCell(layer.children[c] as HTMLElement, c, headerH);
        }
        for (let c = frozenCols; c < layer.children.length; c++) {
          (layer.children[c] as HTMLElement).style.display = 'none';
        }
      } else if (this.frozenHeaderLayer) {
        this.frozenHeaderLayer.style.display = 'none';
      }
    }
  }

  private styleHeaderCell(cell: HTMLElement, col: number, headerH: number): void {
    const { columns } = this.ctx;
    cell.style.display = '';
    cell.style.transform = `translateX(${columns.getX(col)}px)`;
    cell.style.width = `${columns.getWidth(col)}px`;
    cell.style.height = `${headerH}px`;
    cell.setAttribute('role', 'columnheader');
    cell.setAttribute('aria-colindex', String(this.ariaColIndex(col)));
    cell.textContent = columns.getConfig(col)?.label ?? CM.columnLabel(col);
    // Sort indicator: show a subtle arrow on the column that currently drives the
    // order. Setting textContent above already cleared it from every other column.
    const sort = this.ctx.viewMapping.getSortState();
    if (sort && sort.col === col && sort.direction) {
      const ind = document.createElement('span');
      ind.className = 'wt-sort-indicator';
      ind.textContent = sort.direction === 'desc' ? '▼' : '▲';
      cell.appendChild(ind);
    }
    const hAlign = columns.getConfig(col)?.align;
    cell.style.justifyContent = hAlign === 'left' ? 'flex-start' : hAlign === 'right' ? 'flex-end' : 'center';
    cell.style.textAlign = hAlign === 'left' ? 'left' : hAlign === 'right' ? 'right' : 'center';
    cell.dataset.col = String(col);
  }

  private ensureFrozenHeaderLayer(): HTMLElement {
    if (!this.frozenHeaderLayer) {
      const layer = document.createElement('div');
      layer.className = 'wt-frozen-header-layer';
      this.colHeaderEl.appendChild(layer);
      this.frozenHeaderLayer = layer;
    }
    return this.frozenHeaderLayer;
  }

  private createColHeadersInner(): HTMLElement {
    const div = document.createElement('div');
    div.className = 'wt-col-headers-inner';
    div.setAttribute('role', 'row');
    div.setAttribute('aria-rowindex', '1');
    this.colHeaderEl.appendChild(div);
    return div;
  }

  private lastRowHeaderOffsetY = -1;

  private renderRowHeaders(vp: Viewport, scrollY: number): void {
    const { rows, theme } = this.ctx;

    let innerDiv = this.rowHeaderEl.querySelector('.wt-row-headers-inner') as HTMLElement;
    if (!innerDiv) {
      innerDiv = document.createElement('div');
      innerDiv.className = 'wt-row-headers-inner';
      this.rowHeaderEl.appendChild(innerDiv);
    }

    // Follow the body with a compositor transform instead of scrollTop:
    // writing scrollTop every frame forces a synchronous layout.
    const offsetY = this.ctx.layout === 'auto' ? 0 : scrollY;
    if (this.lastRowHeaderOffsetY !== offsetY) {
      innerDiv.style.transform = offsetY ? `translateY(${-offsetY}px)` : '';
      this.lastRowHeaderOffsetY = offsetY;
    }
    innerDiv.style.height = `${rows.getTotalHeight()}px`;

    const needed = vp.endRow - vp.startRow + 1;
    while (innerDiv.children.length < needed) {
      const cell = document.createElement('div');
      cell.className = 'wt-header-cell wt-row-header-cell';
      innerDiv.appendChild(cell);
    }

    for (let i = 0; i < needed; i++) {
      const row = vp.startRow + i;
      const cell = innerDiv.children[i] as HTMLElement;
      cell.style.display = '';
      cell.style.transform = `translateY(${rows.getY(row)}px)`;
      cell.style.height = `${rows.getHeight(row)}px`;
      cell.style.width = `${theme.rowHeaderWidth}px`;
      cell.textContent = this.ctx.rowHeaderLabel?.(row) ?? String(row + 1);
      cell.dataset.row = String(row);
    }

    for (let i = needed; i < innerDiv.children.length; i++) {
      (innerDiv.children[i] as HTMLElement).style.display = 'none';
    }
  }

  private acquireRow(cellCount: number): PooledRow {
    let pooled = this.rowPool.pop();
    if (!pooled) {
      const el = document.createElement('div');
      el.className = 'wt-row';
      el.setAttribute('role', 'row');
      this.viewportEl.appendChild(el);
      pooled = { el, cells: [], rowIndex: -1 };
    }
    this.ensureCells(pooled, cellCount);
    return pooled;
  }

  private ensureCells(pooled: PooledRow, count: number): void {
    while (pooled.cells.length < count) {
      const cell = document.createElement('div');
      cell.className = 'wt-cell';
      cell.setAttribute('role', 'gridcell');
      pooled.el.appendChild(cell);
      pooled.cells.push(cell);
    }
  }

  /** Resolve cell address from a mouse event target */
  getCellFromEvent(e: MouseEvent): { row: number; col: number } | null {
    const target = (e.target as HTMLElement).closest('.wt-cell') as HTMLElement | null;
    if (!target) return null;
    const row = parseInt(target.dataset.row ?? '', 10);
    const col = parseInt(target.dataset.col ?? '', 10);
    if (isNaN(row) || isNaN(col)) return null;
    return { row, col };
  }

  getViewport(): Viewport {
    return this.viewport;
  }

  scrollToCell(row: number, col: number): void {
    const { columns, rows } = this.ctx;
    const x = columns.getX(col);
    const y = rows.getY(row);
    const w = columns.getWidth(col);
    const h = rows.getHeight(row);

    const sc = this.scrollContainer;
    const viewW = sc.clientWidth;
    const viewH = sc.clientHeight;

    // Scroll horizontally if needed
    if (x < sc.scrollLeft) {
      sc.scrollLeft = x;
    } else if (x + w > sc.scrollLeft + viewW) {
      sc.scrollLeft = x + w - viewW;
    }

    if (this.ctx.layout === 'auto' && this.ctx.virtualize) {
      // The page owns vertical scroll: bring the row into the window.
      const top = sc.getBoundingClientRect().top + y;
      // Rows hide under the sticky header and whatever the host pins above it.
      const headerH = (this.ctx.showColHeaders ? this.colHeaderEl.offsetHeight : 0)
        + (parseFloat(getComputedStyle(this.colHeaderEl).top) || 0);
      if (top < headerH) {
        window.scrollBy(0, top - headerH);
      } else if (top + h > window.innerHeight) {
        window.scrollBy(0, top + h - window.innerHeight);
      }
      return;
    }

    // Scroll vertically if needed
    if (y < sc.scrollTop) {
      sc.scrollTop = y;
    } else if (y + h > sc.scrollTop + viewH) {
      sc.scrollTop = y + h - viewH;
    }
  }

  /** Pixel bounds of a cell in the scroll container's content coordinates. */
  getCellBounds(row: number, col: number): { x: number; y: number; width: number; height: number } {
    const { columns, rows } = this.ctx;
    // Content coordinates: the editor overlay lives inside the scroll container,
    // so the scroll offset is already applied by the browser. Subtracting it
    // put the editor columns away from its cell once the grid was scrolled.
    return {
      x: columns.getX(col),
      y: rows.getY(row),
      width: columns.getWidth(col),
      height: rows.getHeight(row),
    };
  }

  getScrollContainer(): HTMLElement {
    return this.scrollContainer;
  }

  getViewportEl(): HTMLElement {
    return this.viewportEl;
  }

  getContainer(): HTMLElement {
    return this.container;
  }

  // ── Event handlers ──

  /** Virtualized auto layout follows the page scroll. */
  private handlePageScroll = (): void => {
    if (this.ctx?.layout === 'auto' && this.ctx.virtualize) this.schedulePaint();
  };

  private handleScroll = (): void => {
    // Frozen columns/header are CSS position:sticky (compositor-pinned), so no
    // per-frame JS repositioning is needed — just re-render the virtualized
    // viewport. The header scrollLeft is synced here so it tracks immediately.
    if (this.ctx.showColHeaders) {
      const x = this.scrollContainer.scrollLeft;
      if (this.lastHeaderScrollX !== x) {
        this.colHeaderEl.scrollLeft = x;
        this.lastHeaderScrollX = x;
      }
    }
    this.schedulePaint();
  };

  private handleMouseDown = (e: MouseEvent): void => {
    // Let interactive content inside a cell (links, buttons, form controls)
    // handle the event itself — otherwise cell selection swallows the click and
    // an <a> rendered in a cell never navigates.
    const target = e.target as HTMLElement | null;
    if (target?.closest('a, button, input, select, textarea, label')) {
      return;
    }
    const cell = this.getCellFromEvent(e);
    if (cell) this.onCellClick?.(cell.row, cell.col, e);
  };

  private handleDblClick = (e: MouseEvent): void => {
    const cell = this.getCellFromEvent(e);
    if (cell) this.onCellDblClick?.(cell.row, cell.col, e);
  };

  private handleContextMenu = (e: MouseEvent): void => {
    const cell = this.getCellFromEvent(e);
    if (cell) this.onCellContextMenu?.(cell.row, cell.col, e);
  };

  private handleColHeaderMouse = (e: MouseEvent): void => {
    const target = (e.target as HTMLElement).closest('.wt-col-header-cell') as HTMLElement | null;
    if (!target) return;
    const col = parseInt(target.dataset.col ?? '', 10);
    if (isNaN(col)) return;

    // Check if clicking near the right edge (resize handle zone)
    const rect = target.getBoundingClientRect();
    if (e.clientX > rect.right - 5) {
      this.onColumnResizeStart?.(col, e.clientX);
      return;
    }

    this.onHeaderClick?.('col', col, e);
  };

  private handleRowHeaderMouse = (e: MouseEvent): void => {
    const target = (e.target as HTMLElement).closest('.wt-row-header-cell') as HTMLElement | null;
    if (!target) return;
    const row = parseInt(target.dataset.row ?? '', 10);
    if (isNaN(row)) return;
    this.onHeaderClick?.('row', row, e);
  };

  private handleCornerMouse = (_e: MouseEvent): void => {
    this.onHeaderClick?.('corner', -1, _e);
  };

  private handleColHeaderContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    const target = (e.target as HTMLElement).closest('.wt-col-header-cell') as HTMLElement | null;
    if (!target) return;
    const col = parseInt(target.dataset.col ?? '', 10);
    if (isNaN(col)) return;
    this.onHeaderContextMenu?.('col', col, e);
  };

  private handleRowHeaderContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    const target = (e.target as HTMLElement).closest('.wt-row-header-cell') as HTMLElement | null;
    if (!target) return;
    const row = parseInt(target.dataset.row ?? '', 10);
    if (isNaN(row)) return;
    this.onHeaderContextMenu?.('row', row, e);
  };

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.scrollContainer.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('scroll', this.handlePageScroll);
    window.removeEventListener('resize', this.handlePageScroll);
    this.viewportEl.removeEventListener('mousedown', this.handleMouseDown);
    this.viewportEl.removeEventListener('dblclick', this.handleDblClick);
    this.viewportEl.removeEventListener('contextmenu', this.handleContextMenu);
    this.colHeaderEl.removeEventListener('mousedown', this.handleColHeaderMouse);
    this.colHeaderEl.removeEventListener('contextmenu', this.handleColHeaderContextMenu);
    this.rowHeaderEl.removeEventListener('mousedown', this.handleRowHeaderMouse);
    this.rowHeaderEl.removeEventListener('contextmenu', this.handleRowHeaderContextMenu);
    this.cornerEl.removeEventListener('mousedown', this.handleCornerMouse);
    this.container.innerHTML = '';
  }
}
