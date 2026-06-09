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

export class WanderTable extends EventEmitter<WanderTableEvents> {
  readonly data: DataModel;
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
    const colCount = options.colCount ?? (flatColumns.length || 26);
    let rowCount: number;

    if (options.mode === 'table' && options.tableData) {
      rowCount = options.tableData.length;
    } else {
      rowCount = options.rowCount ?? 100;
    }

    // Theme
    this.theme = { ...DEFAULT_THEME, ...options.theme };

    // Models
    this.data = new DataModel(rowCount, colCount);
    this.selection = new SelectionModel(rowCount, colCount);
    if (options.infinite) this.selection.infinite = true;
    this.columns = new ColumnModel(colCount, defaultColWidth, flatColumns);
    this.rows = new RowModel(rowCount, defaultRowHeight);
    this.commands = new CommandBus(options.undoLimit ?? 100);
    this.viewMapping = new ViewMapping(this.data);
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
    this.clipboard = new ClipboardManager(this.data, this.selection);

    // Fill handle (inside viewport so position: absolute works correctly)
    this.fillHandle = new FillHandle(
      this.renderer.getViewportEl(),
      this.data,
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
      onCopy: () => { if (this.options.allowClipboard !== false) this.clipboard.copy(); },
      onPaste: () => { if (this.options.allowClipboard !== false) this.pasteWithUndo(); },
      onCut: () => { if (this.options.allowClipboard !== false) this.cutWithUndo(); },
      onUndo: () => { if (this.options.allowUndoRedo !== false) this.undo(); },
      onRedo: () => { if (this.options.allowUndoRedo !== false) this.redo(); },
      onScrollTo: (row, col) => this.renderer.scrollToCell(row, col),
    });

    // Wire up callbacks
    this.wireCallbacks();

    // Initialize renderer
    this.renderer.init({
      data: this.data,
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
      showGridLines: options.showGridLines ?? true,
      showBorder: options.showBorder ?? true,
      preset: options.preset,
      layout: options.layout ?? 'scroll',
      headerRows: this.headerRows.length > 0 ? this.headerRows : undefined,
    });

    // AutoFit (needs renderer to be initialized)
    this.autoFit = new AutoFit(
      container,
      this.data,
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
    this.fillHandle.onFill = (patches, _source, fill) => {
      if (patches.length > 0) {
        const cmd = new PatchCommand(this.data, patches);
        this.execCommand(cmd);
        this.emit('data:patch', { patches });
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
    this.data.onChange = () => {
      this.renderer.scheduleRender();
    };

    // Selection changes trigger re-render + infinite expansion
    this.selection.onChange = () => {
      if (this.options.infinite && this.selection.focus) {
        this.expandIfNeeded(this.selection.focus.row, this.selection.focus.col);
      }
      this.renderer.scheduleRender();
      this.fillHandle.updatePosition();
      this.emit('selection:change', { ranges: this.selection.ranges });
      this.options.onSelectionChange?.(this.selection.ranges);
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
      const cellData = this.data.getCell(row, col);
      const colConfig = this.columns.getConfig(col);
      const defaultType = this.options.defaultCellType ?? 'text';
      const cellType = cellData?.type ?? colConfig?.type ?? defaultType;
      if (cellType === 'checkbox' && !this.options.readOnly && this.options.allowEditing !== false
          && !colConfig?.readOnly && !cellData?.readOnly) {
        const oldValue = !!cellData?.value;
        this.setCellValue(row, col, !oldValue);
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
        const oldValue = this.data.getCell(row, col)?.value;
        // Use command for undo support
        const cmd = new SetCellValueCommand(this.data, row, col, value);
        this.execCommand(cmd);
        this.emit('cell:change', { row, col, oldValue, newValue: value });
        this.options.onCellChange?.(row, col, oldValue, value);
      }
      this.emit('editor:close', { row, col, value, cancelled });
      this.renderer.getContainer().focus();
    };

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

    // Clipboard change
    this.clipboard.onChange = (patches) => {
      this.emit('data:patch', { patches });
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

  /** Override this to customize context menu items */
  contextMenuItems: MenuItemConfig[] = [
    // ── Cell items ──
    { label: 'Copy', shortcut: 'Ctrl+C', visible: (ctx) => ctx.target === 'cell', action: () => this.clipboard.copy() },
    {
      label: 'Paste', shortcut: 'Ctrl+V',
      visible: (ctx) => ctx.target === 'cell',
      disabled: (ctx) => ctx.readOnly,
      action: () => this.pasteWithUndo(),
    },
    {
      label: 'Cut', shortcut: 'Ctrl+X',
      visible: (ctx) => ctx.target === 'cell',
      disabled: (ctx) => ctx.readOnly,
      action: () => this.cutWithUndo(),
    },
    {
      label: '', separator: true,
      visible: (ctx) => ctx.target === 'cell',
    },
    {
      label: 'Delete content', shortcut: 'Del',
      visible: (ctx) => ctx.target === 'cell' && ctx.selectedCount > 0,
      disabled: (ctx) => ctx.readOnly,
      action: () => this.deleteSelected(),
    },
    {
      label: '', separator: true,
      visible: (ctx) => ctx.target === 'cell',
    },
    {
      label: 'Insert row above',
      visible: (ctx) => ctx.target === 'cell' || ctx.target === 'row-header',
      disabled: (ctx) => ctx.readOnly,
      action: (ctx) => this.insertRow(ctx.row),
    },
    {
      label: 'Insert row below',
      visible: (ctx) => ctx.target === 'cell' || ctx.target === 'row-header',
      disabled: (ctx) => ctx.readOnly,
      action: (ctx) => this.insertRow(ctx.row + 1),
    },
    {
      label: 'Insert column left',
      visible: (ctx) => (ctx.target === 'cell' && !ctx.isMultiSelect) || ctx.target === 'column-header',
      disabled: (ctx) => ctx.readOnly,
      action: (ctx) => this.insertColumn(ctx.col),
    },
    {
      label: 'Insert column right',
      visible: (ctx) => (ctx.target === 'cell' && !ctx.isMultiSelect) || ctx.target === 'column-header',
      disabled: (ctx) => ctx.readOnly,
      action: (ctx) => this.insertColumn(ctx.col + 1),
    },

    // ── Column header items ──
    {
      label: '', separator: true,
      visible: (ctx) => ctx.target === 'column-header',
    },
    {
      label: 'Sort ascending',
      visible: (ctx) => ctx.target === 'column-header',
      action: (ctx) => this.sort(ctx.col, 'asc'),
    },
    {
      label: 'Sort descending',
      visible: (ctx) => ctx.target === 'column-header',
      action: (ctx) => this.sort(ctx.col, 'desc'),
    },
    {
      label: 'Clear sort',
      visible: (ctx) => ctx.target === 'column-header' && this.viewMapping.getSortState() !== null,
      action: () => this.clearSort(),
    },
    {
      label: '', separator: true,
      visible: (ctx) => ctx.target === 'column-header',
    },
    {
      label: 'Auto-fit column width',
      visible: (ctx) => ctx.target === 'column-header' || ctx.target === 'cell',
      action: (ctx) => this.autoFitColumn(ctx.col >= 0 ? ctx.col : 0),
    },

    // ── Row header items ──
    {
      label: '', separator: true,
      visible: (ctx) => ctx.target === 'row-header',
    },
    {
      label: 'Select row',
      visible: (ctx) => ctx.target === 'row-header',
      action: (ctx) => this.selection.selectRow(ctx.row),
    },

    // ── Common items ──
    { label: '', separator: true },
    {
      label: 'Undo', shortcut: 'Ctrl+Z',
      disabled: (ctx) => !ctx.canUndo,
      action: () => this.undo(),
    },
    {
      label: 'Redo', shortcut: 'Ctrl+Y',
      disabled: (ctx) => !ctx.canRedo,
      action: () => this.redo(),
    },
  ];

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
      canUndo: this.commands.canUndo,
      canRedo: this.commands.canRedo,
    };
  }

  private openContextMenu(x: number, y: number, row: number, col: number): void {
    const ctx = this.buildMenuContext(row, col);
    this.contextMenu.open(x, y, this.contextMenuItems, ctx);
  }

  // ── Public API ──

  setCell(row: number, col: number, data: CellData): void {
    this.data.setCell(row, col, data);
  }

  getCell(row: number, col: number): CellData | undefined {
    return this.data.getCell(row, col);
  }

  setCellValue(row: number, col: number, value: unknown): void {
    const old = this.data.getCell(row, col)?.value;
    const cmd = new SetCellValueCommand(this.data, row, col, value);
    this.execCommand(cmd);
    this.emit('cell:change', { row, col, oldValue: old, newValue: value });
  }

  deleteCell(row: number, col: number): void {
    this.data.deleteCell(row, col);
  }

  applyPatch(patches: CellPatch[]): void {
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

  getSelection(): SelectionRange[] {
    return [...this.selection.ranges];
  }

  getSelectionInfo() {
    return this.selection.getInfo();
  }

  setSelection(ranges: SelectionRange[]): void {
    if (ranges.length > 0) {
      this.selection.focusCell(ranges[0].startRow, ranges[0].startCol);
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

  destroy(): void {
    // Remove keyboard handler
    if (this._keydownHandler) {
      this.renderer.getContainer().removeEventListener('keydown', this._keydownHandler);
    }
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
    const cellData = this.data.getCell(row, col);
    if (colConfig?.readOnly || cellData?.readOnly) return;

    const defaultType = this.options.defaultCellType ?? 'text';
    const cellType = cellData?.type ?? colConfig?.type ?? defaultType;
    const editorType = colConfig?.editor ?? cellType;

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

  private deleteSelected(): void {
    if (this.options.readOnly) return;
    const cells: { row: number; col: number }[] = [];
    this.selection.forEachSelected((row, col) => {
      if (this.data.hasCell(row, col)) {
        cells.push({ row, col });
      }
    });
    if (cells.length > 0) {
      const cmd = new DeleteCellsCommand(this.data, cells);
      this.execCommand(cmd);
    }
  }

  private async pasteWithUndo(): Promise<void> {
    // Snapshot before paste to support undo
    const focus = this.selection.focus;
    if (!focus) return;

    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return;
    }

    const rows = text.split('\n').map(line => line.split('\t'));
    if (rows.length === 0) return;

    const isSingleCell = rows.length === 1 && rows[0].length === 1;
    const patches: CellPatch[] = [];

    if (isSingleCell && !this.isFullRowOrColSelected()) {
      const value = rows[0][0];
      this.selection.forEachSelected((row, col) => {
        if (row < this.data.rowCount && col < this.data.colCount) {
          patches.push({ row, col, data: { value } });
        }
      });
    } else {
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r].length; c++) {
          const targetRow = focus.row + r;
          const targetCol = focus.col + c;
          if (targetRow >= this.data.rowCount || targetCol >= this.data.colCount) continue;
          patches.push({ row: targetRow, col: targetCol, data: { value: rows[r][c] } });
        }
      }
    }

    if (patches.length > 0) {
      const cmd = new PatchCommand(this.data, patches);
      this.execCommand(cmd);
      this.emit('data:patch', { patches });
    }
  }

  private async cutWithUndo(): Promise<void> {
    await this.clipboard.copy();
    this.deleteSelected();
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
