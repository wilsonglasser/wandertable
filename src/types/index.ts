// ── Cell ──

export type CellKey = `${number}:${number}`;

export interface CellStyle {
  bgColor?: string;
  textColor?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textAlign?: 'left' | 'center' | 'right';
  borderLeft?: string;
  borderRight?: string;
  borderTop?: string;
  borderBottom?: string;
  padding?: number;
}

export interface CellData {
  value: unknown;
  meta?: Record<string, unknown>;
  type?: string;
  readOnly?: boolean;
  className?: string;
  style?: CellStyle;
}

export interface CellPatch {
  row: number;
  col: number;
  data: Partial<CellData>;
}

export interface CellState {
  selected: boolean;
  focused: boolean;
  editing: boolean;
  hover: boolean;
}

export interface CellBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── Selection ──

export interface SelectionRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface CellAddress {
  row: number;
  col: number;
}

export interface SelectionInfo {
  /** Currently focused cell */
  focus: CellAddress | null;
  /** All selection ranges */
  ranges: SelectionRange[];
  /** Normalized bounding box (min/max) across all ranges */
  bounds: { startRow: number; startCol: number; endRow: number; endCol: number } | null;
  /** Total number of cells in the selection */
  cellCount: number;
  /** Number of ranges (1 = single range, >1 = multi-select with Ctrl) */
  rangeCount: number;
  /** Whether more than one cell is selected */
  isMultiCell: boolean;
  /** Whether the selection spans an entire row (all columns) */
  isFullRow: boolean;
  /** Whether the selection spans an entire column (all rows) */
  isFullCol: boolean;
  /** Whether everything is selected */
  isAll: boolean;
  /** Whether nothing is selected */
  isEmpty: boolean;
  /** Number of rows spanned */
  rowSpan: number;
  /** Number of columns spanned */
  colSpan: number;
}

// ── Column ──

export interface DropdownOption {
  value: unknown;
  label: string;
  icon?: string;
  disabled?: boolean;
  group?: string;
}

export interface DropdownConfig {
  options?: DropdownOption[];
  source?: (query: string, row: number, col: number) => Promise<DropdownOption[]>;
  multiple?: boolean;
  searchable?: boolean;
  placeholder?: string;
  renderOption?: (option: DropdownOption, el: HTMLElement) => void;
}

export interface ColumnConfig {
  key?: string;
  label?: string;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  type?: string;
  editor?: string;
  readOnly?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  dropdown?: DropdownConfig;
  align?: 'left' | 'center' | 'right';
  frozen?: boolean;
  /** Grouped/nested columns (table mode). Creates a multi-level header. */
  children?: ColumnConfig[];
}

// ── Row ──

export interface RowConfig {
  height?: number;
  readOnly?: boolean;
  className?: string;
}

// ── Viewport ──

export interface Viewport {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
  scrollX: number;
  scrollY: number;
}

// ── Theme ──

export interface ThemeConfig {
  bgColor?: string;
  cellBgColor?: string;
  cellTextColor?: string;
  headerBgColor?: string;
  headerTextColor?: string;
  gridLineColor?: string;
  selectionBgColor?: string;
  selectionBorderColor?: string;
  focusBorderColor?: string;
  fontFamily?: string;
  fontSize?: number;
  headerFontSize?: number;
  cellPadding?: number;
  headerHeight?: number;
  rowHeaderWidth?: number;
}

// ── Renderer ──

export interface CellRenderer {
  /**
   * Paint a cell's content. Called when the element starts showing a cell or
   * that cell's data was invalidated; selection/focus changes alone only
   * toggle the wt-cell--selected / wt-cell--focused classes.
   */
  render(cell: HTMLElement, data: CellData | undefined, state: CellState): void;
  /** Called before the element is painted again (same or another cell). */
  cleanup?(cell: HTMLElement): void;
}

// ── Editor ──

export interface CellEditor {
  createElement(container: HTMLElement): HTMLElement;
  open(value: unknown, bounds: CellBounds, cellData: CellData | undefined): void;
  getValue(): unknown;
  close(): void;
  validate?(value: unknown): boolean | string;
}

// ── Events ──

export interface CommandChangeEvent {
  row: number;
  col: number;
  oldValue: unknown;
  newValue: unknown;
}

export interface WanderTableEvents {
  'cell:change': { row: number; col: number; oldValue: unknown; newValue: unknown };
  'cell:click': { row: number; col: number; event: MouseEvent };
  'cell:dblclick': { row: number; col: number; event: MouseEvent };
  'cell:contextmenu': { row: number; col: number; event: MouseEvent };
  'selection:change': { ranges: SelectionRange[] };
  'editor:open': { row: number; col: number };
  'editor:close': { row: number; col: number; value: unknown; cancelled: boolean };
  'scroll': { viewport: Viewport };
  'column:resize': { col: number; width: number };
  'row:resize': { row: number; height: number };
  'data:patch': { patches: CellPatch[] };
  /** Fired after any command executes (edit, paste, delete, etc.) */
  'command:execute': { changes: CommandChangeEvent[] };
  /** Fired after an undo - changes show what was RESTORED (old -> new is the undo direction) */
  'command:undo': { changes: CommandChangeEvent[] };
  /** Fired after a redo - changes show what was RE-APPLIED */
  'command:redo': { changes: CommandChangeEvent[] };
}

// ── Options ──

// ── Pagination ──

export interface PaginationConfig {
  /** Enable pagination */
  enabled: boolean;
  /** Rows per page */
  pageSize: number;
  /** Current page (0-based) */
  page?: number;
  /** Total rows (for server-side pagination - if set, overrides data.rowCount) */
  totalRows?: number;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  startRow: number;
  endRow: number;
}

/**
 * Read-only view of cell data. The grid reads every cell through this, so a
 * host can keep its own document as the single source of truth instead of
 * copying it into the built-in DataModel. Lookups must be cheap: they run for
 * every visible cell on every paint.
 */
export interface CellSource {
  readonly rowCount: number;
  readonly colCount: number;
  getCell(row: number, col: number): CellData | undefined;
  hasCell(row: number, col: number): boolean;
}

export interface WanderTableOptions {
  /** 'spreadsheet' = independent cells (default), 'table' = column-driven rows */
  mode?: 'spreadsheet' | 'table';
  data?: CellPatch[];
  /** Table mode: array of row objects keyed by column.key */
  tableData?: Record<string, unknown>[];
  columns?: ColumnConfig[];
  rowCount?: number;
  /**
   * External cell data. When set, the grid reads from it (rowCount/colCount
   * included) and the host calls invalidate()/setSize() after changing it.
   */
  source?: CellSource;
  /** Accessible name per cell (aria-label), e.g. reference + field name. */
  cellLabel?: (row: number, col: number, data: CellData | undefined) => string | null | undefined;
  colCount?: number;
  defaultRowHeight?: number;
  defaultColWidth?: number;
  /**
   * Stretch columns to fill the container width. Columns without an explicit
   * `width` share the remaining space (recomputed on container resize).
   */
  fitColumns?: boolean;
  readOnly?: boolean;
  showRowHeaders?: boolean;
  showColHeaders?: boolean;
  frozenRows?: number;
  frozenCols?: number;
  /** Allow column resize by dragging header edge. Default: true */
  allowColResize?: boolean;
  /** Allow row resize by dragging row header edge. Default: true */
  allowRowResize?: boolean;
  /** Allow multi-cell selection. Default: true */
  allowRangeSelection?: boolean;
  /** Allow editing cells (double click / typing). Default: true */
  allowEditing?: boolean;
  /** Allow clipboard operations (copy/paste/cut). Default: true */
  allowClipboard?: boolean;
  /** Allow context menu on right-click. Default: true */
  allowContextMenu?: boolean;
  /** Allow keyboard navigation. Default: true */
  allowKeyboardNav?: boolean;
  /** Allow cell selection at all. Default: true */
  allowSelection?: boolean;
  /** Enable undo/redo. Default: true */
  allowUndoRedo?: boolean;
  /** Show fill handle on selection for drag-to-fill. Default: true */
  allowFillHandle?: boolean;
  /** Allow column reorder by dragging headers. Default: false */
  allowColReorder?: boolean;
  /** Initial row groups for expand/collapse */
  rowGroups?: { startRow: number; count: number; label?: string; expanded?: boolean; depth?: number }[];
  /** Called when scroll reaches near the end - for lazy loading more data */
  onLoadMore?: (direction: 'down' | 'right') => void;
  /** Automatically fit row height to cell content after render. Default: false */
  autoRowHeight?: boolean;
  /**
   * Grow the column header to fit wrapped labels (multi-line headers) instead
   * of clipping them at the fixed headerHeight. Default: false.
   */
  autoHeaderHeight?: boolean;
  /** Show grid lines between cells. Default: true */
  showGridLines?: boolean;
  /** Show border around the grid. Default: true */
  showBorder?: boolean;
  /**
   * Visual preset applied as a root class.
   * - 'spreadsheet' (default): full grid lines, filled header — classic look.
   * - 'standard': clean table — no vertical grid lines, horizontal row
   *   separators only, transparent header. Matches a modern app data table.
   * - 'invisible': chromeless — transparent background, borders and grid lines
   *   present but transparent. For embedding a grid with no visible table.
   */
  preset?: 'spreadsheet' | 'standard' | 'invisible';
  /** Auto-expand grid when navigating/editing beyond current bounds. Default: false */
  infinite?: boolean;
  /**
   * 'scroll' (default): fixed height container with internal scroll + virtualization.
   * 'auto': grid grows to fit all content, scroll is on the page. No virtualization.
   */
  layout?: 'scroll' | 'auto';
  undoLimit?: number;
  /** Renderer used for cells without data or without a type. Default: 'text' */
  defaultCellType?: string;
  /** Initial merged cell ranges */
  merges?: { row: number; col: number; rowSpan: number; colSpan: number }[];
  /** Initial sort */
  sort?: { col: number; direction: 'asc' | 'desc' };
  /** Initial filters: key is column index */
  filters?: Record<number, (row: number, data: any) => boolean>;
  /** Pagination config */
  pagination?: PaginationConfig;
  /** Loading state - shows overlay */
  loading?: boolean;
  theme?: Partial<ThemeConfig>;

  onCellChange?: (row: number, col: number, oldValue: unknown, newValue: unknown) => void;
  onSelectionChange?: (ranges: SelectionRange[]) => void;
  onScroll?: (viewport: Viewport) => void;
  onContextMenu?: (row: number, col: number, event: MouseEvent) => void;
  /**
   * External sort callback. If set, sorting is NOT done internally -
   * the callback is responsible for re-supplying data in the correct order.
   * Return true to indicate the sort was handled externally.
   */
  onSort?: (col: number, direction: 'asc' | 'desc' | null, key?: string) => boolean | void;
  /**
   * External filter callback. If set, filtering is NOT done internally.
   * Return true to indicate the filter was handled externally.
   */
  onFilter?: (col: number, key: string | undefined, active: boolean) => boolean | void;
  /**
   * Fill handle callback. Called when user drags the fill handle.
   * Receives the source range (what was selected) and the fill range (where it's being filled).
   * Return a CellPatch[] to apply custom values, or true to cancel default fill behavior.
   * Return void/false to use default fill (repeat pattern).
   */
  onFill?: (source: SelectionRange, fill: SelectionRange, direction: 'down' | 'up' | 'right' | 'left' | 'diagonal') => CellPatch[] | boolean | void;
  /** Called when page changes (pagination) */
  onPageChange?: (page: number, pageSize: number) => void;
}

export const DEFAULT_THEME: ThemeConfig = {
  bgColor: '#ffffff',
  cellBgColor: '#ffffff',
  cellTextColor: '#1e293b',
  headerBgColor: '#f8fafc',
  headerTextColor: '#475569',
  gridLineColor: '#e2e8f0',
  selectionBgColor: 'rgba(59, 130, 246, 0.08)',
  selectionBorderColor: '#3b82f6',
  focusBorderColor: '#3b82f6',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: 13,
  headerFontSize: 12,
  cellPadding: 8,
  headerHeight: 28,
  rowHeaderWidth: 50,
};
