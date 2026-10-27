import type {
  CellData,
  CellEditor,
  CellPatch,
  CellRenderer,
  ColumnConfig,
  SelectionRange,
  ThemeConfig,
  Viewport,
  WanderTableEvents,
  WanderTableOptions,
  CellSource,
  GridIntent,
  GridLabels,
} from './types/index.js';
import { DEFAULT_THEME } from './types/index.js';
import { DataModel } from './core/DataModel.js';
import { EventEmitter } from './core/EventEmitter.js';
import { SelectionModel } from './core/SelectionModel.js';
import { CommandBus, SetCellValueCommand, DeleteCellsCommand, PatchCommand, type Command } from './core/CommandBus.js';
import { ColumnModel } from './columns/ColumnModel.js';
import { RowModel } from './rows/RowModel.js';
import { DOMRenderer } from './render/DOMRenderer.js';
import { AutoFit } from './render/AutoFit.js';
import { RendererRegistry } from './renderers/RendererRegistry.js';
import { EditorManager } from './editors/EditorManager.js';
import { KeyboardNav } from './interaction/KeyboardNav.js';
import { parseTSV } from './interaction/tsv.js';
import { ClipboardManager } from './interaction/ClipboardManager.js';
import { ColumnResize } from './interaction/ColumnResize.js';
import { RowResize } from './interaction/RowResize.js';
import { ContextMenu, type MenuItemConfig, type MenuContext, type MenuTarget } from './plugins/ContextMenu.js';
import { FillHandle } from './interaction/FillHandle.js';
import { ColumnReorder } from './interaction/ColumnReorder.js';
import { RowGroupModel } from './core/RowGroupModel.js';
import { ViewMapping, type SortDirection, type FilterFn } from './core/ViewMapping.js';
import { MergeModel, type MergeRange } from './core/MergeModel.js';
import { PaginationModel } from './core/PaginationModel.js';
import { flattenColumns, type HeaderCell } from './columns/GroupedHeaders.js';
import { PaginationBar } from './render/PaginationBar.js';
import { LoadingOverlay } from './render/LoadingOverlay.js';
import { exportCSV, exportJSON, downloadFile, type ExportOptions } from './plugins/Export.js';

/** Built-in UI strings; hosts translate them through options.labels. */
export const DEFAULT_LABELS: GridLabels = {
  copy: 'Copy',
  paste: 'Paste',
  cut: 'Cut',
  deleteContent: 'Delete content',
  insertRowAbove: 'Insert row above',
  insertRowBelow: 'Insert row below',
  insertColumnLeft: 'Insert column left',
  insertColumnRight: 'Insert column right',
  sortAscending: 'Sort ascending',
  sortDescending: 'Sort descending',
  clearSort: 'Clear sort',
  autoFitColumn: 'Auto-fit column width',
  selectRow: 'Select row',
  undo: 'Undo',
  redo: 'Redo',
};

export class WanderTable extends EventEmitter<WanderTableEvents> {
  readonly data: DataModel;
  /** Where every cell read goes: options.source, or the built-in DataModel. */
  readonly source: CellSource;
  readonly selection: SelectionModel;
  readonly columns: ColumnModel;
  readonly rows: RowModel;
  readonly commands: CommandBus;
  readonly viewMapping: ViewMapping;
  readonly merges: MergeModel;
  readonly pagination: PaginationModel;
  readonly rowGroups: RowGroupModel;

  private renderer: DOMRenderer;
  private rendererRegistry: RendererRegistry;
  private editorManager: EditorManager;
  private keyboard: KeyboardNav;
  private clipboard: ClipboardManager;
  private columnResize: ColumnResize;
  private rowResize: RowResize;
  private contextMenu: ContextMenu;
  private autoFit: AutoFit;
  private paginationBar: PaginationBar | null = null;
  private loadingOverlay: LoadingOverlay;
  private fillHandle: FillHandle;
  private columnReorder: ColumnReorder;
  private headerRows: HeaderCell[][] = [];
  private theme: ThemeConfig;
  private options: WanderTableOptions;

  // Drag selection state
  private isDragging = false;
  private _infiniteScrollHandler: (() => void) | null = null;
  private _lazyLoadHandler: (() => void) | null = null;
  private _keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private _resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement, options: WanderTableOptions = {}) {
    super();
    this.options = options;
    this.contextMenuItems = this.defaultMenuItems();

    const defaultRowHeight = options.defaultRowHeight ?? 28;
    const defaultColWidth = options.defaultColWidth ?? 100;

    // Flatten grouped columns if needed
    let flatColumns = options.columns ?? [];
    if (flatColumns.some(c => c.children && c.children.length > 0)) {
      const result = flattenColumns(flatColumns);
      flatColumns = result.flatColumns;
      this.headerRows = result.headerRows;
    }

    // Determine dimensions
    const colCount = options.source?.colCount ?? options.colCount ?? (flatColumns.length || 26);
    let rowCount: number;

    if (options.source) {
      rowCount = options.source.rowCount;
    } else if (options.mode === 'table' && options.tableData) {
      rowCount = options.tableData.length;
    } else {
      rowCount = options.rowCount ?? 100;
    }

    // Theme
    this.theme = { ...DEFAULT_THEME, ...options.theme };

    // Models
    this.data = new DataModel(rowCount, colCount);
    this.source = options.source ?? this.data;
    this.selection = new SelectionModel(rowCount, colCount);
    if (options.infinite) this.selection.infinite = true;
    this.columns = new ColumnModel(colCount, defaultColWidth, flatColumns);
    this.rows = new RowModel(rowCount, defaultRowHeight);
    this.commands = new CommandBus(options.undoLimit ?? 100);
    this.viewMapping = new ViewMapping(this.source);
    this.merges = new MergeModel();
    this.pagination = new PaginationModel(options.pagination);
    this.rowGroups = new RowGroupModel(
      options.rowGroups?.map(g => ({
        ...g,
        expanded: g.expanded ?? true,
        depth: g.depth ?? 0,
      })),
    );

    // Renderer registry
    this.rendererRegistry = new RendererRegistry();

    // DOM Renderer
    this.renderer = new DOMRenderer(container);

    // Editor manager
    this.editorManager = new EditorManager(this.renderer.getScrollContainer());

    // Column resize
    this.columnResize = new ColumnResize(this.columns);
    this.columnReorder = new ColumnReorder(this.columns);

    // Row resize
    this.rowResize = new RowResize(this.rows);

    // Context menu
    this.contextMenu = new ContextMenu();

    // Clipboard
    this.clipboard = new ClipboardManager(this.source, this.selection, options.clipboardHtml ?? null);

    // Fill handle (inside viewport so position: absolute works correctly)
    this.fillHandle = new FillHandle(
      this.renderer.getViewportEl(),
      this.source,
      this.selection,
      this.columns,
      this.rows,
    );

    // Keyboard
    this.keyboard = new KeyboardNav(this.selection, {
      onStartEdit: (row, col, initialChar) => {
        if (this.options.allowEditing !== false) this.startEditing(row, col, initialChar);
      },
      onDelete: () => this.deleteSelected(),
      onUndo: () => { if (this.options.allowUndoRedo !== false) this.commit({ type: 'undo' }); },
      onRedo: () => { if (this.options.allowUndoRedo !== false) this.commit({ type: 'redo' }); },
      onScrollTo: (row, col) => this.renderer.scrollToCell(row, col),
      pageRows: () => {
        const vp = this.renderer.getViewport();
        return Math.max(1, vp.endRow - vp.startRow - 6);
      },
      jumpTarget: (from, dRow, dCol) => this.dataEdge(from, dRow, dCol),
    });

    // Wire up callbacks
    this.wireCallbacks();

    // Initialize renderer
    this.renderer.init({
      data: this.source,
      columns: this.columns,
      rows: this.rows,
      selection: this.selection,
      viewMapping: this.viewMapping,
      merges: this.merges,
      theme: this.theme,
      renderers: this.rendererRegistry.getAll(),
      defaultRenderer: this.rendererRegistry.defaultRenderer,
      defaultCellType: options.defaultCellType ?? 'text',
      showRowHeaders: options.showRowHeaders ?? true,
      showColHeaders: options.showColHeaders ?? true,
      frozenRows: options.frozenRows ?? 0,
      frozenCols: options.frozenCols ?? 0,
      autoRowHeight: options.autoRowHeight ?? false,
      autoHeaderHeight: options.autoHeaderHeight ?? false,
      showGridLines: options.showGridLines ?? true,
      showBorder: options.showBorder ?? true,
      preset: options.preset,
      layout: options.layout ?? 'scroll',
      virtualize: options.virtualize ?? false,
      headerRows: this.headerRows.length > 0 ? this.headerRows : undefined,
      cellLabel: options.cellLabel,
    });

    // AutoFit (needs renderer to be initialized)
    this.autoFit = new AutoFit(
      container,
      this.source,
      this.columns,
      this.rows,
      this.rendererRegistry.getAll(),
      this.rendererRegistry.defaultRenderer,
    );

    // Fill handle wiring
    // Fill handle lives inside viewportEl, so bounds are absolute (no scroll offset)
    this.fillHandle.getCellBounds = (row, col) => ({
      x: this.columns.getX(col),
      y: this.rows.getY(row),
      width: this.columns.getWidth(col),
      height: this.rows.getHeight(row),
    });
    this.fillHandle.getCellAtPoint = (x, y) => {
      // Convert screen coords to cell via the renderer
      const sc = this.renderer.getScrollContainer();
      const rect = sc.getBoundingClientRect();
      const scrollX = sc.scrollLeft;
      const scrollY = sc.scrollTop;
      const px = x - rect.left + scrollX;
      const py = y - rect.top + scrollY;
      const row = this.rows.getRowAtY(py);
      const col = this.columns.getColAtX(px);
      if (row >= 0 && col >= 0) return { row, col };
      return null;
    };
    this.fillHandle.enabled = options.allowFillHandle !== false;
    this.fillHandle.onFillCallback = options.onFill ?? null;
    this.fillHandle.onFill = (patches, source, fill, direction) => {
      if (patches.length > 0) {
        this.commit({ type: 'fill', source, target: fill, direction, patches });
      }
      // Extend selection to include filled area
      this.selection.extendTo(fill.endRow, fill.endCol);
    };

    // Loading overlay
    this.loadingOverlay = new LoadingOverlay(container);
    if (options.loading) this.loadingOverlay.show();

    // Pagination bar
    if (options.pagination?.enabled) {
      this.paginationBar = new PaginationBar(container);
      this.pagination.setTotalRows(options.pagination.totalRows ?? rowCount);
      this.paginationBar.update(this.pagination.getState());
      this.paginationBar.onPageChange = (page) => {
        if (page === -1) this.pagination.prevPage();
        else if (page === -2) this.pagination.nextPage();
        else if (page === -3) this.pagination.lastPage();
        else this.pagination.setPage(page);
      };
      this.pagination.onChange = (state) => {
        this.paginationBar?.update(state);
        this.options.onPageChange?.(state.page, state.pageSize);
        this.renderer.scheduleRender();
      };
    }

    // Apply initial data
    if (options.mode === 'table' && options.tableData) {
      this.loadTableData(options.tableData, flatColumns);
    } else if (options.data) {
      this.data.applyPatch(options.data);
    }

    // Apply initial merges
    if (options.merges) {
      for (const m of options.merges) {
        this.merges.addMerge(m, false);
      }
    }

    // Apply initial sort/filter
    if (options.sort) {
      this.viewMapping.sort(options.sort.col, options.sort.direction);
    }
    if (options.filters) {
      for (const [col, fn] of Object.entries(options.filters)) {
        this.viewMapping.setFilter(Number(col), fn);
      }
    }

    // Merge changes trigger re-render
    this.merges.onChange = () => {
      this.renderer.scheduleRender();
    };

    // ViewMapping changes trigger layout + re-render
    this.viewMapping.onChange = () => {
      this.renderer.updateLayout();
      this.renderer.scheduleRender();
    };

    // Infinite scroll: expand when user scrolls near the bottom/right edge
    if (options.infinite) {
      const expandAmount = 20;
      const threshold = 200; // px from edge

      if (options.layout === 'auto') {
        // Auto layout: listen to window scroll (vertical + horizontal)
        this._infiniteScrollHandler = () => {
          let changed = false;
          const docH = document.documentElement.scrollHeight;
          const docW = document.documentElement.scrollWidth;
          const scrollBottom = window.scrollY + window.innerHeight;
          const scrollRight = window.scrollX + window.innerWidth;

          if (docH - scrollBottom < threshold) {
            this.data.rowCount += expandAmount;
            this.rows.setCount(this.data.rowCount);
            this.viewMapping.rebuild();
            changed = true;
          }
          if (docW - scrollRight < threshold) {
            this.data.colCount += expandAmount;
            this.columns.setCount(this.data.colCount);
            changed = true;
          }
          if (changed) {
            this.selection.setDimensions(this.data.rowCount, this.data.colCount);
            this.refresh();
          }
        };
        window.addEventListener('scroll', this._infiniteScrollHandler, { passive: true });
      } else {
        // Scroll layout: listen to scroll container
        const sc = this.renderer.getScrollContainer();
        this._infiniteScrollHandler = () => {
          if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - threshold) {
            this.data.rowCount += expandAmount;
            this.rows.setCount(this.data.rowCount);
            this.selection.setDimensions(this.data.rowCount, this.data.colCount);
            this.viewMapping.rebuild();
            this.refresh();
          }
          if (sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - threshold) {
            this.data.colCount += expandAmount;
            this.columns.setCount(this.data.colCount);
            this.selection.setDimensions(this.data.rowCount, this.data.colCount);
            this.refresh();
          }
        };
        sc.addEventListener('scroll', this._infiniteScrollHandler, { passive: true });
      }
    }

    // Fit columns to the container width (flex columns share the leftover space),
    // recomputed when the container resizes.
    if (options.fitColumns) {
      const fit = () => {
        const w = this.renderer.getContainer().clientWidth;
        if (w > 0 && this.columns.fitToWidth(w)) {
          this.refresh();
        }
      };
      fit();
      if (typeof ResizeObserver !== 'undefined') {
        this._resizeObserver = new ResizeObserver(() => fit());
        this._resizeObserver.observe(this.renderer.getContainer());
      }
    }

    // Focus the container
    this.renderer.getContainer().focus();
  }

  private wireCallbacks(): void {
    // Data changes trigger re-render
    this.data.onChange = (dirty) => {
      if (dirty.size === 0) {
        this.renderer.scheduleRender();
        return;
      }
      const cells: { row: number; col: number }[] = [];
      for (const key of dirty) {
        const sep = key.indexOf(':');
        cells.push({ row: Number(key.slice(0, sep)), col: Number(key.slice(sep + 1)) });
      }
      this.renderer.invalidateCells(cells);
    };

    // Selection changes trigger re-render + infinite expansion
    this.selection.onChange = () => {
      if (this.options.infinite && this.selection.focus) {
        this.expandIfNeeded(this.selection.focus.row, this.selection.focus.col);
      }
      this.renderer.schedulePaint();
      this.fillHandle.updatePosition();
      this.emit('selection:change', { ranges: this.getSelection() });
      this.options.onSelectionChange?.(this.getSelection());
    };

    // Cell click
    this.renderer.onCellClick = (row, col, e) => {
      if (this.contextMenu.isOpen) {
        this.contextMenu.close();
      }
      if (this.editorManager.isEditing) {
        this.editorManager.close(true);
      }

      // Checkbox toggle on click
      const cellData = this.source.getCell(row, col);
      const colConfig = this.columns.getConfig(col);
      const defaultType = this.options.defaultCellType ?? 'text';
      const cellType = cellData?.type ?? colConfig?.type ?? defaultType;
      if (cellType === 'checkbox' && !this.options.readOnly && this.options.allowEditing !== false
          && !colConfig?.readOnly && !cellData?.readOnly) {
        const oldValue = !!cellData?.value;
        this.commit({ type: 'edit', row, col, value: !oldValue, previous: cellData?.value });
        if (this.options.allowSelection !== false) this.selection.focusCell(row, col);
        this.emit('cell:click', { row, col, event: e });
        return;
      }

      if (this.options.allowSelection !== false) {
        if (e.shiftKey && this.options.allowRangeSelection !== false) {
          this.selection.extendTo(row, col);
        } else if ((e.ctrlKey || e.metaKey) && this.options.allowRangeSelection !== false) {
          this.selection.addRange({ startRow: row, startCol: col, endRow: row, endCol: col });
        } else {
          this.selection.focusCell(row, col);
        }
      }

      this.emit('cell:click', { row, col, event: e });

      // Start drag selection
      if (this.options.allowRangeSelection !== false && this.options.allowSelection !== false) {
        this.isDragging = true;
        const onMouseMove = (me: MouseEvent) => {
          if (!this.isDragging) return;
          const cell = this.renderer.getCellFromEvent(me);
          if (cell) {
            this.selection.extendTo(cell.row, cell.col);
          }
        };
        const onMouseUp = () => {
          this.isDragging = false;
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      }
    };

    // Double click -> edit
    this.renderer.onCellDblClick = (row, col, e) => {
      this.emit('cell:dblclick', { row, col, event: e });
      if (!this.options.readOnly && this.options.allowEditing !== false) {
        this.startEditing(row, col);
      }
    };

    // Context menu
    this.renderer.onCellContextMenu = (row, col, e) => {
      e.preventDefault();
      this.emit('cell:contextmenu', { row, col, event: e });
      if (this.options.allowContextMenu === false) return;

      // Select cell if not already selected
      if (this.options.allowSelection !== false && !this.selection.isSelected(row, col)) {
        this.selection.focusCell(row, col);
      }

      this.openContextMenu(e.clientX, e.clientY, row, col);
    };

    // Header clicks
    this.renderer.onHeaderClick = (type, index, e) => {
      if (type === 'col') {
        if (this.options.allowColReorder) {
          this.columnReorder.start(index, e, this.renderer.getContainer());
        } else {
          this.selection.selectColumn(index);
        }
      } else if (type === 'row') {
        // Check for bottom edge -> row resize
        const target = (e.target as HTMLElement).closest('.wt-row-header-cell') as HTMLElement | null;
        if (target) {
          const rect = target.getBoundingClientRect();
          if (e.clientY > rect.bottom - 4 && this.options.allowRowResize !== false) {
            this.rowResize.start(index, e.clientY);
            return;
          }
        }
        this.selection.selectRow(index);
      } else if (type === 'corner') {
        this.selection.selectAll();
      }
    };

    // Column resize
    this.renderer.onColumnResizeStart = (col, startX) => {
      if (this.options.allowColResize === false) return;
      this.columnResize.start(col, startX);
    };

    this.columnResize.onResize = (col, width) => {
      this.renderer.updateLayout();
      this.renderer.scheduleRender();
      this.emit('column:resize', { col, width });
    };

    // Row resize
    this.rowResize.onResize = (row, height) => {
      this.renderer.updateLayout();
      this.renderer.scheduleRender();
      this.emit('row:resize', { row, height });
    };

    // Scroll
    this.renderer.onScroll = (viewport) => {
      this.emit('scroll', { viewport });
      this.options.onScroll?.(viewport);
    };

    // Editor close
    this.editorManager.onClose = (row, col, value, cancelled) => {
      if (!cancelled && value !== undefined) {
        this.commit({ type: 'edit', row, col, value, previous: this.source.getCell(row, col)?.value });
      }
      this.emit('editor:close', { row, col, value, cancelled });
      this.renderer.getContainer().focus();
    };
    this.editorManager.onAdvance = (dRow, dCol) => {
      this.selection.move(dRow, dCol, false);
      const focus = this.selection.focus;
      if (focus) this.renderer.scrollToCell(focus.row, focus.col);
    };
    this.editorManager.onInvalid = (row, col, value, message) => {
      this.emit('editor:invalid', { row, col, value, message });
    };

    // Native clipboard events: the keyboard leaves Ctrl+C/X/V to the browser.
    const root = this.renderer.getContainer();
    root.addEventListener('copy', this.handleCopyEvent);
    root.addEventListener('cut', this.handleCutEvent);
    root.addEventListener('paste', this.handlePasteEvent);

    // Keyboard
    this._keydownHandler = (e: KeyboardEvent) => {
      if (this.options.allowKeyboardNav === false) return;
      if (this.editorManager.isEditing) return;
      this.keyboard.handleKeyDown(e);
    };
    this.renderer.getContainer().addEventListener('keydown', this._keydownHandler);

    // Header context menu
    this.renderer.onHeaderContextMenu = (type, index, e) => {
      const target = type === 'col' ? 'column-header' as const : 'row-header' as const;
      const row = type === 'row' ? index : -1;
      const col = type === 'col' ? index : -1;
      const ctx = this.buildMenuContext(row, col, target);
      this.contextMenu.open(e.clientX, e.clientY, this.contextMenuItems, ctx);
    };


    // Column reorder
    this.columnReorder.getColAtX = (clientX) => {
      const sc = this.renderer.getScrollContainer();
      const rect = sc.getBoundingClientRect();
      return this.columns.getColAtX(clientX - rect.left + sc.scrollLeft);
    };
    this.columnReorder.getColLabel = (col) => {
      return this.columns.getConfig(col)?.label ?? ColumnModel.columnLabel(col);
    };
    this.columnReorder.onReorder = (from, to) => {
      this.reorderColumn(from, to);
    };

    // Row groups: apply filter to ViewMapping
    this.rowGroups.onChange = () => {
      const filter = this.rowGroups.getFilter();
      this.viewMapping.setFilter(-1, (row) => filter(row));
    };
    // Apply initial filter if groups exist
    if (this.options.rowGroups && this.options.rowGroups.length > 0) {
      const filter = this.rowGroups.getFilter();
      this.viewMapping.setFilter(-1, (row) => filter(row));
    }

    // Lazy loading: onLoadMore callback
    if (this.options.onLoadMore) {
      const onLoadMore = this.options.onLoadMore;
      const threshold = 200;

      if (this.options.layout === 'auto') {
        this._lazyLoadHandler = () => {
          const docH = document.documentElement.scrollHeight;
          const scrollBottom = window.scrollY + window.innerHeight;
          if (docH - scrollBottom < threshold) onLoadMore('down');
        };
        window.addEventListener('scroll', this._lazyLoadHandler, { passive: true });
      } else {
        const sc = this.renderer.getScrollContainer();
        this._lazyLoadHandler = () => {
          if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - threshold) {
            onLoadMore('down');
          }
          if (sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - threshold) {
            onLoadMore('right');
          }
        };
        sc.addEventListener('scroll', this._lazyLoadHandler, { passive: true });
      }
    }
  }

  // ── Context Menu ──

  /** Override this to customize context menu items (built in the constructor, after options). */
  contextMenuItems!: MenuItemConfig[];

  private defaultMenuItems(): MenuItemConfig[] {
    const L = { ...DEFAULT_LABELS, ...this.options.labels };
    return [
    // ── Cell items ──
    { id: 'copy', label: L.copy, shortcut: 'Ctrl+C', visible: (ctx) => ctx.target === 'cell', action: () => { void this.clipboard.copyAsync(); } },
    {
      id: 'paste', label: L.paste, shortcut: 'Ctrl+V',
      visible: (ctx) => ctx.target === 'cell',
      disabled: (ctx) => ctx.readOnly,
      action: () => { void this.pasteFromMenu(); },
    },
    {
      id: 'cut', label: L.cut, shortcut: 'Ctrl+X',
      visible: (ctx) => ctx.target === 'cell',
      disabled: (ctx) => ctx.readOnly,
      action: () => { void this.cutFromMenu(); },
    },
    {
      label: '', separator: true,
      visible: (ctx) => ctx.target === 'cell',
    },
    {
      id: 'deleteContent', label: L.deleteContent, shortcut: 'Del',
      visible: (ctx) => ctx.target === 'cell' && ctx.selectedCount > 0,
      disabled: (ctx) => ctx.readOnly,
      action: () => this.deleteSelected(),
    },
    {
      label: '', separator: true,
      visible: (ctx) => ctx.target === 'cell',
    },
    {
      id: 'insertRowAbove', label: L.insertRowAbove,
      visible: (ctx) => ctx.target === 'cell' || ctx.target === 'row-header',
      disabled: (ctx) => ctx.readOnly,
      action: (ctx) => this.commit({ type: 'insertRows', at: ctx.row, count: 1 }),
    },
    {
      id: 'insertRowBelow', label: L.insertRowBelow,
      visible: (ctx) => ctx.target === 'cell' || ctx.target === 'row-header',
      disabled: (ctx) => ctx.readOnly,
      action: (ctx) => this.commit({ type: 'insertRows', at: ctx.row + 1, count: 1 }),
    },
    {
      id: 'insertColumnLeft', label: L.insertColumnLeft,
      visible: (ctx) => (ctx.target === 'cell' && !ctx.isMultiSelect) || ctx.target === 'column-header',
      disabled: (ctx) => ctx.readOnly,
      action: (ctx) => this.commit({ type: 'insertColumns', at: ctx.col, count: 1 }),
    },
    {
      id: 'insertColumnRight', label: L.insertColumnRight,
      visible: (ctx) => (ctx.target === 'cell' && !ctx.isMultiSelect) || ctx.target === 'column-header',
      disabled: (ctx) => ctx.readOnly,
      action: (ctx) => this.commit({ type: 'insertColumns', at: ctx.col + 1, count: 1 }),
    },

    // ── Column header items ──
    {
      label: '', separator: true,
      visible: (ctx) => ctx.target === 'column-header',
    },
    {
      id: 'sortAscending', label: L.sortAscending,
      visible: (ctx) => ctx.target === 'column-header',
      action: (ctx) => this.sort(ctx.col, 'asc'),
    },
    {
      id: 'sortDescending', label: L.sortDescending,
      visible: (ctx) => ctx.target === 'column-header',
      action: (ctx) => this.sort(ctx.col, 'desc'),
    },
    {
      id: 'clearSort', label: L.clearSort,
      visible: (ctx) => ctx.target === 'column-header' && this.viewMapping.getSortState() !== null,
      action: () => this.clearSort(),
    },
    {
      label: '', separator: true,
      visible: (ctx) => ctx.target === 'column-header',
    },
    {
      id: 'autoFitColumn', label: L.autoFitColumn,
      visible: (ctx) => ctx.target === 'column-header' || ctx.target === 'cell',
      action: (ctx) => this.autoFitColumn(ctx.col >= 0 ? ctx.col : 0),
    },

    // ── Row header items ──
    {
      label: '', separator: true,
      visible: (ctx) => ctx.target === 'row-header',
    },
    {
      id: 'selectRow', label: L.selectRow,
      visible: (ctx) => ctx.target === 'row-header',
      action: (ctx) => this.selection.selectRow(ctx.row),
    },

    // ── Common items ──
    { label: '', separator: true },
    {
      id: 'undo', label: L.undo, shortcut: 'Ctrl+Z',
      disabled: (ctx) => !ctx.canUndo,
      action: () => this.commit({ type: 'undo' }),
    },
    {
      id: 'redo', label: L.redo, shortcut: 'Ctrl+Y',
      disabled: (ctx) => !ctx.canRedo,
      action: () => this.commit({ type: 'redo' }),
    },
    ];
  }

  private buildMenuContext(row: number, col: number, target: MenuTarget = 'cell'): MenuContext {
    const bounds = this.selection.getBounds();
    let selectedCount = 0;
    this.selection.forEachSelected(() => { selectedCount++; });

    return {
      target,
      row,
      col,
      selectedCount,
      isMultiSelect: selectedCount > 1,
      isFullRow: bounds ? bounds.c1 === 0 && bounds.c2 === this.data.colCount - 1 : false,
      isFullCol: bounds ? bounds.r1 === 0 && bounds.r2 === this.data.rowCount - 1 : false,
      readOnly: !!this.options.readOnly,
      canUndo: this.isExternal ? this.options.history?.canUndo() ?? true : this.commands.canUndo,
      canRedo: this.isExternal ? this.options.history?.canRedo() ?? true : this.commands.canRedo,
    };
  }

  private openContextMenu(x: number, y: number, row: number, col: number): void {
    const ctx = this.buildMenuContext(row, col);
    this.contextMenu.open(x, y, this.contextMenuItems, ctx);
  }

  // ── Public API ──

  setCell(row: number, col: number, data: CellData): void {
    this.assertInternal('setCell');
    this.data.setCell(row, col, data);
  }

  getCell(row: number, col: number): CellData | undefined {
    return this.source.getCell(row, col);
  }

  setCellValue(row: number, col: number, value: unknown): void {
    this.assertInternal('setCellValue');
    const old = this.data.getCell(row, col)?.value;
    const cmd = new SetCellValueCommand(this.data, row, col, value);
    this.execCommand(cmd);
    this.emit('cell:change', { row, col, oldValue: old, newValue: value });
  }

  deleteCell(row: number, col: number): void {
    this.assertInternal('deleteCell');
    this.data.deleteCell(row, col);
  }

  applyPatch(patches: CellPatch[]): void {
    this.assertInternal('applyPatch');
    const cmd = new PatchCommand(this.data, patches);
    this.execCommand(cmd);
    this.emit('data:patch', { patches });
  }

  transaction(fn: () => void): void {
    this.data.transaction(fn);
  }

  undo(): void {
    const cmd = this.commands.undo();
    if (cmd) {
      const changes = cmd.getChanges().map(c => ({
        row: c.row, col: c.col,
        oldValue: c.newValue,
        newValue: c.oldValue,
      }));
      this.emit('command:undo', { changes });
    }
  }

  redo(): void {
    const cmd = this.commands.redo();
    if (cmd) {
      this.emit('command:redo', { changes: cmd.getChanges() });
    }
  }

  /**
   * Selected ranges, clamped to the grid. Whole rows/columns/all are kept as
   * Infinity inside the SelectionModel; hosts get real indexes so a loop over
   * the range always ends.
   */
  getSelection(): SelectionRange[] {
    const maxRow = Math.max(0, this.selection.rowCount - 1);
    const maxCol = Math.max(0, this.selection.colCount - 1);
    const clamp = (v: number, max: number) => (Number.isFinite(v) ? Math.min(v, max) : max);
    return this.selection.ranges.map((r) => ({
      startRow: clamp(r.startRow, maxRow),
      startCol: clamp(r.startCol, maxCol),
      endRow: clamp(r.endRow, maxRow),
      endCol: clamp(r.endCol, maxCol),
    }));
  }

  getSelectionInfo() {
    return this.selection.getInfo();
  }

  setSelection(ranges: SelectionRange[]): void {
    if (ranges.length > 0) {
      this.selection.focusCell(ranges[0].startRow, ranges[0].startCol);
      if (ranges[0].endRow !== ranges[0].startRow || ranges[0].endCol !== ranges[0].startCol) {
        this.selection.extendTo(ranges[0].endRow, ranges[0].endCol);
      }
      for (let i = 1; i < ranges.length; i++) {
        this.selection.addRange(ranges[i]);
      }
    }
  }

  scrollTo(row: number, col: number): void {
    this.renderer.scrollToCell(row, col);
  }

  registerRenderer(name: string, renderer: CellRenderer): void {
    this.rendererRegistry.register(name, renderer);
  }

  registerEditor(name: string, factory: () => CellEditor): void {
    this.editorManager.register(name, factory);
  }

  setColumnWidth(col: number, width: number): void {
    this.columns.setWidth(col, width);
    this.renderer.updateLayout();
    this.renderer.scheduleRender();
  }

  setRowHeight(row: number, height: number): void {
    this.rows.setHeight(row, height);
    this.renderer.updateLayout();
    this.renderer.scheduleRender();
  }

  autoFitColumn(col: number): void {
    const width = this.autoFit.autoFitColumn(col);
    this.columns.setWidth(col, width);
    this.renderer.updateLayout();
    this.renderer.scheduleRender();
    this.emit('column:resize', { col, width });
  }

  autoFitRow(row: number): void {
    const height = this.autoFit.autoFitRow(row);
    this.rows.setHeight(row, height);
    this.renderer.updateLayout();
    this.renderer.scheduleRender();
    this.emit('row:resize', { row, height });
  }

  insertRow(at: number): void {
    this.assertInternal('insertRow');
    this.data.rowCount += 1;
    this.rows.setCount(this.data.rowCount);
    this.selection.setDimensions(this.data.rowCount, this.data.colCount);

    // Shift data down from `at`
    this.data.transaction(() => {
      for (let r = this.data.rowCount - 1; r > at; r--) {
        for (let c = 0; c < this.data.colCount; c++) {
          const cell = this.data.getCell(r - 1, c);
          if (cell) {
            this.data.setCell(r, c, { ...cell });
          } else {
            this.data.deleteCell(r, c);
          }
        }
      }
      // Clear the inserted row
      for (let c = 0; c < this.data.colCount; c++) {
        this.data.deleteCell(at, c);
      }
    });

    this.renderer.updateLayout();
    this.renderer.scheduleRender();
  }

  insertColumn(at: number): void {
    this.assertInternal('insertColumn');
    this.data.colCount += 1;
    this.columns.setCount(this.data.colCount);
    this.selection.setDimensions(this.data.rowCount, this.data.colCount);

    // Shift data right from `at`
    this.data.transaction(() => {
      for (let r = 0; r < this.data.rowCount; r++) {
        for (let c = this.data.colCount - 1; c > at; c--) {
          const cell = this.data.getCell(r, c - 1);
          if (cell) {
            this.data.setCell(r, c, { ...cell });
          } else {
            this.data.deleteCell(r, c);
          }
        }
        this.data.deleteCell(r, at);
      }
    });

    this.renderer.updateLayout();
    this.renderer.scheduleRender();
  }

  // ── Sort & Filter ──

  sort(col: number, direction: SortDirection, compareFn?: (a: unknown, b: unknown) => number): void {
    // External sort callback
    if (this.options.onSort) {
      const key = this.columns.getConfig(col)?.key;
      const handled = this.options.onSort(col, direction, key);
      if (handled === true) return; // externally handled, don't sort internally
    }
    this.viewMapping.sort(col, direction, compareFn);
  }

  clearSort(): void {
    if (this.options.onSort) {
      const handled = this.options.onSort(-1, null);
      if (handled === true) return;
    }
    this.viewMapping.clearSort();
  }

  getSortState() {
    return this.viewMapping.getSortState();
  }

  setFilter(col: number, fn: FilterFn): void {
    if (this.options.onFilter) {
      const key = this.columns.getConfig(col)?.key;
      const handled = this.options.onFilter(col, key, true);
      if (handled === true) return;
    }
    this.viewMapping.setFilter(col, fn);
  }

  removeFilter(col: number): void {
    if (this.options.onFilter) {
      const key = this.columns.getConfig(col)?.key;
      const handled = this.options.onFilter(col, key, false);
      if (handled === true) return;
    }
    this.viewMapping.removeFilter(col);
  }

  clearFilters(): void {
    this.viewMapping.clearFilters();
  }

  getActiveFilters(): number[] {
    return this.viewMapping.getActiveFilters();
  }

  // ── Merge ──

  mergeCells(row: number, col: number, rowSpan: number, colSpan: number): void {
    this.merges.addMerge({ row, col, rowSpan, colSpan });
    this.renderer.scheduleRender();
  }

  unmergeCells(row: number, col: number): void {
    this.merges.removeMerge(row, col);
    this.renderer.scheduleRender();
  }

  getMerge(row: number, col: number): MergeRange | null {
    return this.merges.getMerge(row, col);
  }

  clearMerges(): void {
    this.merges.clear();
    this.renderer.scheduleRender();
  }

  // ── Row Groups ──

  addRowGroup(startRow: number, count: number, label?: string, expanded = true): void {
    this.rowGroups.addGroup({ startRow, count, label, expanded, depth: 0 });
  }

  removeRowGroup(startRow: number): void {
    this.rowGroups.removeGroup(startRow);
  }

  toggleRowGroup(startRow: number): void {
    this.rowGroups.toggleGroup(startRow);
  }

  expandAllGroups(): void {
    this.rowGroups.expandAll();
  }

  collapseAllGroups(): void {
    this.rowGroups.collapseAll();
  }

  // ── Export ──

  exportCSV(options?: ExportOptions): string {
    return exportCSV(this.data, this.viewMapping, options);
  }

  exportJSON(options?: ExportOptions): object[] {
    return exportJSON(this.data, this.viewMapping, options);
  }

  downloadCSV(filename = 'export.csv', options?: ExportOptions): void {
    const csv = this.exportCSV(options);
    downloadFile(csv, filename, 'text/csv;charset=utf-8');
  }

  downloadJSON(filename = 'export.json', options?: ExportOptions): void {
    const json = JSON.stringify(this.exportJSON(options), null, 2);
    downloadFile(json, filename, 'application/json');
  }

  getViewport(): Viewport {
    return this.renderer.getViewport();
  }

  refresh(): void {
    this.renderer.updateLayout();
    this.renderer.scheduleRender();
  }

  /**
   * Repaint after the host changed cells in an external source: just `cells`,
   * or every visible cell when omitted. Calls coalesce into one animation frame.
   */
  invalidate(cells?: Iterable<{ row: number; col: number }>): void {
    if (cells) {
      this.renderer.invalidateCells(cells);
    } else {
      this.renderer.scheduleRender();
    }
  }

  /** Resize the grid to an external source's new dimensions. */
  setSize(rowCount: number, colCount: number): void {
    this.data.rowCount = rowCount;
    this.data.colCount = colCount;
    this.rows.setCount(rowCount);
    this.columns.setCount(colCount);
    this.selection.setDimensions(rowCount, colCount);
    this.viewMapping.rebuild();
    this.renderer.updateLayout();
    this.renderer.scheduleRender();
  }

  destroy(): void {
    // Remove keyboard handler
    if (this._keydownHandler) {
      this.renderer.getContainer().removeEventListener('keydown', this._keydownHandler);
    }
    const root = this.renderer.getContainer();
    root.removeEventListener('copy', this.handleCopyEvent);
    root.removeEventListener('cut', this.handleCutEvent);
    root.removeEventListener('paste', this.handlePasteEvent);
    // Remove infinite scroll handler
    if (this._infiniteScrollHandler) {
      window.removeEventListener('scroll', this._infiniteScrollHandler);
      this.renderer.getScrollContainer().removeEventListener('scroll', this._infiniteScrollHandler);
    }
    // Remove lazy load handler
    if (this._lazyLoadHandler) {
      window.removeEventListener('scroll', this._lazyLoadHandler);
      this.renderer.getScrollContainer().removeEventListener('scroll', this._lazyLoadHandler);
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    this.fillHandle.destroy();
    this.columnReorder.destroy();
    this.editorManager.destroy();
    this.columnResize.destroy();
    this.rowResize.destroy();
    this.contextMenu.destroy();
    this.autoFit.destroy();
    this.loadingOverlay.destroy();
    this.paginationBar?.destroy();
    this.renderer.destroy();
    this.removeAllListeners();
  }

  // ── Private ──

  private startEditing(row: number, col: number, initialChar?: string): void {
    if (this.options.readOnly) return;

    const colConfig = this.columns.getConfig(col);
    const cellData = this.source.getCell(row, col);
    if (colConfig?.readOnly || cellData?.readOnly) return;

    const defaultType = this.options.defaultCellType ?? 'text';
    const cellType = cellData?.type ?? colConfig?.type ?? defaultType;
    const editorType = cellData?.editor ?? colConfig?.editor ?? cellType;

    // Blank cells: emit event but don't open editor
    if (editorType === 'blank') {
      this.emit('editor:open', { row, col });
      this.emit('editor:close', { row, col, value: undefined, cancelled: true });
      return;
    }

    const bounds = this.renderer.getCellBounds(row, col);
    const value = cellData?.value;

    this.emit('editor:open', { row, col });
    this.editorManager.open(row, col, editorType, value, bounds, cellData, initialChar);
  }

  private get isExternal(): boolean {
    return this.options.source !== undefined;
  }

  private assertInternal(method: string): void {
    if (this.isExternal) {
      throw new Error(`WanderTable.${method}: data is owned by options.source; change it there and call invalidate()`);
    }
  }

  /**
   * Every user action that changes data lands here. External source: emit the
   * intent, mutate nothing. Built-in DataModel: apply it with undo support.
   */
  private commit(intent: GridIntent): void {
    this.emit('intent', intent);
    this.options.onIntent?.(intent);
    if (!this.isExternal) this.applyIntent(intent);
  }

  private isCellReadOnly(row: number, col: number): boolean {
    return !!(this.source.getCell(row, col)?.readOnly || this.columns.getConfig(col)?.readOnly);
  }

  private applyIntent(intent: GridIntent): void {
    switch (intent.type) {
      case 'edit': {
        this.execCommand(new SetCellValueCommand(this.data, intent.row, intent.col, intent.value));
        this.emit('cell:change', { row: intent.row, col: intent.col, oldValue: intent.previous, newValue: intent.value });
        this.options.onCellChange?.(intent.row, intent.col, intent.previous, intent.value);
        break;
      }
      case 'paste':
      case 'fill': {
        const patches: CellPatch[] = intent.type === 'paste'
          ? intent.cells.map((c) => ({ row: c.row, col: c.col, data: { value: c.value } }))
          : intent.patches;
        const writable = patches.filter((p) => !this.isCellReadOnly(p.row, p.col));
        if (writable.length > 0) {
          this.execCommand(new PatchCommand(this.data, writable));
          this.emit('data:patch', { patches: writable });
        }
        break;
      }
      case 'clear': {
        const cells: { row: number; col: number }[] = [];
        for (const range of intent.ranges) {
          const r1 = Math.min(range.startRow, range.endRow);
          const r2 = Math.max(range.startRow, range.endRow);
          const c1 = Math.min(range.startCol, range.endCol);
          const c2 = Math.max(range.startCol, range.endCol);
          for (let r = r1; r <= r2; r++) {
            for (let c = c1; c <= c2; c++) {
              if (this.data.hasCell(r, c) && !this.isCellReadOnly(r, c)) cells.push({ row: r, col: c });
            }
          }
        }
        if (cells.length > 0) this.execCommand(new DeleteCellsCommand(this.data, cells));
        break;
      }
      case 'insertRows':
        for (let i = 0; i < intent.count; i++) this.insertRow(intent.at);
        break;
      case 'insertColumns':
        for (let i = 0; i < intent.count; i++) this.insertColumn(intent.at);
        break;
      case 'undo':
        this.undo();
        break;
      case 'redo':
        this.redo();
        break;
    }
  }

  private deleteSelected(): void {
    if (this.options.readOnly || this.selection.ranges.length === 0) return;
    this.commit({ type: 'clear', ranges: this.getSelection(), cut: false });
  }

  /**
   * Resolve clipboard text into cell writes: a single value fills the whole
   * selection, a block lands at the focus cell. Then commit a paste intent.
   */
  private pasteText(text: string, html: string | null): void {
    const focus = this.selection.focus;
    if (!focus || this.options.readOnly) return;
    const values = parseTSV(text);
    if (values.length === 0 && !html) return;

    const cells: { row: number; col: number; value: string }[] = [];
    const rowCount = this.source.rowCount;
    const colCount = this.source.colCount;
    if (values.length === 1 && values[0].length === 1 && !this.isFullRowOrColSelected()) {
      const value = values[0][0];
      this.selection.forEachSelected((row, col) => {
        if (row < rowCount && col < colCount) cells.push({ row, col, value });
      });
    } else {
      for (let r = 0; r < values.length; r++) {
        for (let c = 0; c < values[r].length; c++) {
          const row = focus.row + r;
          const col = focus.col + c;
          if (row >= rowCount || col >= colCount) continue;
          cells.push({ row, col, value: values[r][c] });
        }
      }
    }
    this.commit({ type: 'paste', anchor: { ...focus }, values, html, cells });
  }

  private handleCopyEvent = (e: ClipboardEvent): void => {
    if (this.editorManager.isEditing || this.options.allowClipboard === false) return;
    this.clipboard.writeEvent(e);
  };

  private handleCutEvent = (e: ClipboardEvent): void => {
    if (this.editorManager.isEditing || this.options.allowClipboard === false) return;
    if (this.clipboard.writeEvent(e) && !this.options.readOnly) {
      this.commit({ type: 'clear', ranges: this.getSelection(), cut: true });
    }
  };

  private handlePasteEvent = (e: ClipboardEvent): void => {
    if (this.editorManager.isEditing || this.options.allowClipboard === false || !e.clipboardData) return;
    e.preventDefault();
    this.pasteText(e.clipboardData.getData('text/plain'), e.clipboardData.getData('text/html') || null);
  };

  private async pasteFromMenu(): Promise<void> {
    const content = await this.clipboard.readAsync();
    if (content) this.pasteText(content.text, content.html);
  }

  private async cutFromMenu(): Promise<void> {
    if (await this.clipboard.copyAsync()) this.deleteSelected();
  }

  /**
   * Ctrl+Arrow target, spreadsheet rule: inside a filled run go to its last
   * filled cell; otherwise go to the next filled cell; otherwise the edge.
   */
  private dataEdge(from: { row: number; col: number }, dRow: number, dCol: number): { row: number; col: number } {
    const maxRow = this.source.rowCount - 1;
    const maxCol = this.source.colCount - 1;
    const inside = (r: number, c: number) => r >= 0 && c >= 0 && r <= maxRow && c <= maxCol;
    const filled = (r: number, c: number) => {
      const v = this.source.getCell(r, c)?.value;
      return v !== undefined && v !== null && v !== '';
    };
    let r = from.row;
    let c = from.col;
    if (!inside(r + dRow, c + dCol)) return { row: r, col: c };
    if (filled(r, c) && filled(r + dRow, c + dCol)) {
      while (inside(r + dRow, c + dCol) && filled(r + dRow, c + dCol)) {
        r += dRow;
        c += dCol;
      }
      return { row: r, col: c };
    }
    r += dRow;
    c += dCol;
    while (inside(r, c) && !filled(r, c)) {
      if (!inside(r + dRow, c + dCol)) return { row: r, col: c };
      r += dRow;
      c += dCol;
    }
    return { row: r, col: c };
  }

  private execCommand(cmd: Command): void {
    this.commands.execute(cmd);
    this.emit('command:execute', { changes: cmd.getChanges() });
  }

  /** Move a column from one index to another, shifting data */
  reorderColumn(fromCol: number, toCol: number): void {
    if (fromCol === toCol) return;

    // Swap column data in every row
    this.data.transaction(() => {
      for (let r = 0; r < this.data.rowCount; r++) {
        const cells: (import('./types/index.js').CellData | undefined)[] = [];
        for (let c = 0; c < this.data.colCount; c++) {
          cells.push(this.data.getCell(r, c));
        }
        // Remove from old position, insert at new
        const moved = cells.splice(fromCol, 1)[0];
        cells.splice(toCol, 0, moved);
        // Write back
        for (let c = 0; c < cells.length; c++) {
          if (cells[c]) {
            this.data.setCell(r, c, cells[c]!);
          } else {
            this.data.deleteCell(r, c);
          }
        }
      }
    });

    // Reorder column widths
    const widths: number[] = [];
    for (let c = 0; c < this.columns.count; c++) {
      widths.push(this.columns.getWidth(c));
    }
    const movedW = widths.splice(fromCol, 1)[0];
    widths.splice(toCol, 0, movedW);
    for (let c = 0; c < widths.length; c++) {
      this.columns.setWidth(c, widths[c]);
    }

    this.refresh();
  }

  private expandIfNeeded(row: number, col: number): void {
    let changed = false;

    if (row >= this.data.rowCount) {
      const newCount = row + 2;
      this.data.rowCount = newCount;
      this.rows.setCount(newCount);
      this.viewMapping.rebuild();
      changed = true;
    }

    if (col >= this.data.colCount) {
      const newCount = col + 2;
      this.data.colCount = newCount;
      this.columns.setCount(newCount);
      changed = true;
    }

    if (changed) {
      this.selection.setDimensions(this.data.rowCount, this.data.colCount);
      this.refresh();
    }
  }

  private isFullRowOrColSelected(): boolean {
    const bounds = this.selection.getBounds();
    if (!bounds) return false;
    return (bounds.c1 === 0 && bounds.c2 === this.data.colCount - 1) ||
           (bounds.r1 === 0 && bounds.r2 === this.data.rowCount - 1);
  }

  /** Load row objects into the sparse DataModel using column keys */
  private loadTableData(rows: Record<string, unknown>[], columns: ColumnConfig[]): void {
    const keyToCol = new Map<string, number>();
    columns.forEach((c, i) => {
      if (c.key) keyToCol.set(c.key, i);
    });

    this.data.transaction(() => {
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        for (const [key, value] of Object.entries(row)) {
          const col = keyToCol.get(key);
          if (col !== undefined) {
            this.data.setCell(r, col, { value });
          }
        }
      }
    });
  }

  // ── Table Mode API ──

  /** Replace all table data (table mode) */
  setTableData(rows: Record<string, unknown>[]): void {
    const columns = this.options.columns ?? [];
    // Flatten if needed
    let flat = columns;
    if (columns.some(c => c.children && c.children.length > 0)) {
      flat = flattenColumns(columns).flatColumns;
    }

    this.data.clear();
    this.data.rowCount = rows.length;
    this.rows.setCount(rows.length);
    this.selection.setDimensions(rows.length, this.data.colCount);
    this.loadTableData(rows, flat);

    if (this.pagination.enabled) {
      this.pagination.setTotalRows(rows.length);
    }

    this.viewMapping.rebuild();
    this.refresh();
  }

  // ── Loading ──

  setLoading(loading: boolean): void {
    if (loading) {
      this.loadingOverlay.show();
    } else {
      this.loadingOverlay.hide();
    }
  }

  get isLoading(): boolean {
    return this.loadingOverlay.isVisible;
  }

  // ── Pagination API ──

  setPage(page: number): void {
    this.pagination.setPage(page);
  }

  setPageSize(size: number): void {
    this.pagination.setPageSize(size);
  }

  getPaginationState() {
    return this.pagination.getState();
  }
}
