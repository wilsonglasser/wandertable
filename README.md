# WanderTable

[![CI](https://github.com/wilsonglasser/wandertable/actions/workflows/ci.yml/badge.svg)](https://github.com/wilsonglasser/wandertable/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/wandertable)](https://www.npmjs.com/package/wandertable)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-wilsonglasser-ff5e5b?logo=ko-fi&logoColor=white)](https://ko-fi.com/wilsonglasser)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-wilsonglasser-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/wilsonglasser)

High-performance grid/spreadsheet library for the web. Zero dependencies, TypeScript, DOM-virtualized.

## Features

- **Two modes**: Spreadsheet (independent cells) and Table (column-driven rows)
- **Two layouts**: `scroll` (fixed height, internal scroll, virtualized) and `auto` (grows with content, page scroll)
- **DOM virtualized**: Only visible cells exist in the DOM (~750 nodes max). Recycled on scroll.
- **Rich cell content**: Each cell is a real `<div>` - any HTML, CSS, hover effects, transitions
- **Renderers**: text, number, checkbox, badge, progress, blank - or register your own
- **Editors**: text, dropdown (async, searchable, multi-select), blank - or register your own
- **Cell-level types**: Each cell can have its own renderer/editor independent of the column
- **Selection**: Single, range (Shift), multi-range (Ctrl), full row/column, select all
- **Keyboard navigation**: Arrows, Tab, Enter, Escape, Home/End, Ctrl+arrows, typing to edit
- **Clipboard**: Copy/paste/cut as TSV (compatible with Excel/Sheets). Single-cell paste fills selection.
- **Undo/Redo**: Command pattern with configurable stack limit
- **Sorting**: Per-column, asc/desc, custom comparator, external callback for server-side
- **Filtering**: Per-column, custom filter functions, external callback for server-side
- **Merge cells**: Merge/unmerge arbitrary ranges
- **Frozen panes**: Sticky rows and columns that stay visible on scroll
- **Grouped headers**: Multi-level column headers (e.g. "Months / Jan Feb Mar")
- **Pagination**: Built-in pagination bar with page size, total rows, navigation
- **Context menu**: Dynamic items with `visible`/`disabled` as callbacks, per-target (cell/column/row header)
- **Resize**: Column and row resize by dragging header edges (individually toggleable)
- **Auto-fit**: Columns and rows auto-size to content
- **Auto row height**: Rows automatically grow to fit cell content
- **Export**: CSV and JSON with download, configurable columns/headers
- **Themes**: Light, Dark, Minimal presets - or define your own via CSS variables
- **Loading overlay**: Show/hide spinner overlay for async operations
- **Events**: Typed event system for cell changes, selection, scroll, commands, editor lifecycle
- **Command events**: `command:execute`, `command:undo`, `command:redo` for syncing with external databases
- **Fill handle**: Drag to fill cells in any direction (including diagonal), with custom callback
- **Column reorder**: Drag headers to reorder columns
- **Row grouping**: Expand/collapse groups of rows
- **Infinite mode**: Grid auto-expands on navigate/scroll beyond bounds
- **Lazy loading**: `onLoadMore` callback when scroll reaches the edge
- **Sparse data model**: Map-based, only cells with data consume memory. Patches for partial updates.

## Install

```bash
npm install wandertable
```

## Quick Start

### Spreadsheet Mode

```typescript
import { WanderTable } from 'wandertable';
import 'wandertable/style.css';

const table = new WanderTable(document.getElementById('grid'), {
  mode: 'spreadsheet',
  rowCount: 1000,
  colCount: 26,
  showRowHeaders: true,
  showColHeaders: true,
});

// Set individual cells
table.setCellValue(0, 0, 'Hello');
table.setCellValue(0, 1, 42);

// Bulk load
table.applyPatch([
  { row: 1, col: 0, data: { value: 'World', style: { fontWeight: 'bold' } } },
  { row: 1, col: 1, data: { value: true, type: 'checkbox' } },
  { row: 2, col: 0, data: { value: 75, type: 'progress' } },
  { row: 2, col: 1, data: { value: 'active', type: 'badge' } },
]);
```

### Table Mode

```typescript
const table = new WanderTable(document.getElementById('grid'), {
  mode: 'table',
  layout: 'auto', // grows with content, scroll on page
  autoRowHeight: true,
  columns: [
    { key: 'name', label: 'Name', width: 180 },
    { key: 'email', label: 'Email', width: 200 },
    { key: 'status', label: 'Status', type: 'badge', width: 100 },
    { key: 'active', label: 'Active', type: 'checkbox', width: 70 },
  ],
  tableData: [
    { name: 'Alice', email: 'alice@test.com', status: 'active', active: true },
    { name: 'Bob', email: 'bob@test.com', status: 'pending', active: false },
  ],
});
```

### Grouped Column Headers

```typescript
const table = new WanderTable(el, {
  mode: 'table',
  columns: [
    { key: 'name', label: 'Name', width: 180 },
    {
      label: 'Q4 Sales',
      children: [
        { key: 'oct', label: 'Oct', type: 'number', width: 80 },
        { key: 'nov', label: 'Nov', type: 'number', width: 80 },
        { key: 'dec', label: 'Dec', type: 'number', width: 80 },
      ],
    },
    {
      label: 'Metrics',
      children: [
        { key: 'score', label: 'Score', type: 'progress', width: 120 },
        { key: 'active', label: 'Active', type: 'checkbox', width: 70 },
      ],
    },
  ],
  tableData: [...],
});
```

## Options

```typescript
new WanderTable(container, {
  // ── Mode & Layout ──
  mode: 'spreadsheet' | 'table',       // default: 'spreadsheet'
  layout: 'scroll' | 'auto',           // default: 'scroll'

  // ── Data ──
  data: CellPatch[],                    // initial cell patches (spreadsheet mode)
  tableData: Record<string, unknown>[], // initial row objects (table mode)
  columns: ColumnConfig[],              // column definitions
  rowCount: number,                     // default: 100
  colCount: number,                     // default: 26

  // ── Dimensions ──
  defaultRowHeight: number,             // default: 28
  defaultColWidth: number,              // default: 100
  autoRowHeight: boolean,               // auto-fit row height to content. default: false

  // ── Display ──
  showRowHeaders: boolean,              // show row numbers. default: true
  showColHeaders: boolean,              // show column letters/labels. default: true
  showGridLines: boolean,               // show cell borders. default: true
  showBorder: boolean,                  // show outer border. default: true
  loading: boolean,                     // show loading overlay. default: false

  // ── Frozen Panes ──
  frozenRows: number,                   // sticky rows at top. default: 0
  frozenCols: number,                   // sticky columns at left. default: 0

  // ── Permissions ──
  readOnly: boolean,                    // no editing at all. default: false
  allowEditing: boolean,                // allow cell editing. default: true
  allowSelection: boolean,              // allow cell selection. default: true
  allowRangeSelection: boolean,         // allow multi-cell selection. default: true
  allowColResize: boolean,              // column resize by drag. default: true
  allowRowResize: boolean,              // row resize by drag. default: true
  allowClipboard: boolean,              // copy/paste/cut. default: true
  allowContextMenu: boolean,            // right-click menu. default: true
  allowKeyboardNav: boolean,            // keyboard navigation. default: true
  allowUndoRedo: boolean,               // undo/redo. default: true

  // ── Cell Defaults ──
  defaultCellType: string,              // renderer for cells without type. default: 'text'
  undoLimit: number,                    // max undo stack size. default: 100

  // ── Merge & Sort & Filter ──
  merges: MergeRange[],                 // initial merged ranges
  sort: { col, direction },             // initial sort
  filters: Record<number, FilterFn>,    // initial filters
  pagination: PaginationConfig,         // pagination settings

  // ── Theme ──
  theme: Partial<ThemeConfig>,          // or use THEME_DARK, THEME_MINIMAL

  // ── Callbacks ──
  onCellChange: (row, col, oldValue, newValue) => void,
  onSelectionChange: (ranges) => void,
  onScroll: (viewport) => void,
  onContextMenu: (row, col, event) => void,
  onSort: (col, direction, key?) => boolean | void,    // return true for external sort
  onFilter: (col, key, active) => boolean | void,      // return true for external filter
  onPageChange: (page, pageSize) => void,
});
```

## API

### Data

```typescript
table.setCell(row, col, cellData)      // set full cell data
table.getCell(row, col)                // get cell data
table.setCellValue(row, col, value)    // set just the value (with undo)
table.deleteCell(row, col)             // remove cell
table.applyPatch(patches)             // bulk update (with undo)
table.transaction(() => { ... })       // batch changes, single re-render
table.setTableData(rows)              // replace all data (table mode)
```

### Selection

```typescript
table.getSelection()                   // get selected ranges
table.getSelectionInfo()               // rich info: focus, bounds, cellCount, isFullRow, etc.
table.setSelection(ranges)             // set selection programmatically
table.scrollTo(row, col)               // scroll to make cell visible
```

### Undo / Redo

```typescript
table.undo()
table.redo()
table.commands.canUndo                 // boolean
table.commands.canRedo                 // boolean
table.commands.clear()                 // clear history
```

### Sort & Filter

```typescript
table.sort(col, 'asc' | 'desc' | null, compareFn?)
table.clearSort()
table.getSortState()

table.setFilter(col, (row, data) => boolean)
table.removeFilter(col)
table.clearFilters()
table.getActiveFilters()               // column indices with active filters
```

### Merge

```typescript
table.mergeCells(row, col, rowSpan, colSpan)
table.unmergeCells(row, col)
table.getMerge(row, col)               // get merge at cell
table.clearMerges()
```

### Layout

```typescript
table.setColumnWidth(col, width)
table.setRowHeight(row, height)
table.autoFitColumn(col)               // auto-size to content
table.autoFitRow(row)                  // auto-size to content
table.insertRow(at)
table.insertColumn(at)
table.refresh()                        // force re-render
```

### Export

```typescript
table.exportCSV(options?)              // returns CSV string
table.exportJSON(options?)             // returns object[]
table.downloadCSV('file.csv', options?)
table.downloadJSON('file.json', options?)
```

Options: `{ visibleOnly, columns, includeHeaders, headers }`

### Pagination

```typescript
table.setPage(page)                    // 0-based
table.setPageSize(size)
table.getPaginationState()             // { page, pageSize, totalRows, totalPages, startRow, endRow }
table.pagination.nextPage()
table.pagination.prevPage()
table.pagination.firstPage()
table.pagination.lastPage()
```

### Loading

```typescript
table.setLoading(true)                 // show spinner overlay
table.setLoading(false)                // hide
table.isLoading                        // boolean
```

### Renderers & Editors

```typescript
// Register custom renderer
table.registerRenderer('my-type', {
  render(cell: HTMLElement, data: CellData | undefined, state: CellState) {
    cell.innerHTML = `<div class="custom">${data?.value ?? ''}</div>`;
  }
});

// Register custom editor
table.registerEditor('my-editor', () => ({
  createElement(container) { ... },
  open(value, bounds, cellData) { ... },
  getValue() { ... },
  close() { ... },
}));

// Use per cell
table.setCell(0, 0, { value: 'hello', type: 'my-type' });

// Or per column
columns: [{ key: 'status', type: 'my-type', editor: 'my-editor' }]
```

Built-in renderers: `text`, `number`, `checkbox`, `badge`, `progress`, `blank`

### Context Menu

```typescript
// Override menu items
table.contextMenuItems = [
  {
    label: 'My Action',
    shortcut: 'Ctrl+M',
    visible: (ctx) => ctx.target === 'cell',        // show only for cells
    disabled: (ctx) => ctx.readOnly,                 // disable when readOnly
    action: (ctx) => console.log(ctx.row, ctx.col),
  },
  { label: '', separator: true },
  {
    label: 'Column Action',
    visible: (ctx) => ctx.target === 'column-header',
    action: (ctx) => console.log('col', ctx.col),
  },
];
```

`MenuContext` fields: `target`, `row`, `col`, `selectedCount`, `isMultiSelect`, `isFullRow`, `isFullCol`, `readOnly`, `canUndo`, `canRedo`

### Events

```typescript
table.on('cell:change', ({ row, col, oldValue, newValue }) => { ... })
table.on('cell:click', ({ row, col, event }) => { ... })
table.on('cell:dblclick', ({ row, col, event }) => { ... })
table.on('cell:contextmenu', ({ row, col, event }) => { ... })
table.on('selection:change', ({ ranges }) => { ... })
table.on('editor:open', ({ row, col }) => { ... })
table.on('editor:close', ({ row, col, value, cancelled }) => { ... })
table.on('scroll', ({ viewport }) => { ... })
table.on('column:resize', ({ col, width }) => { ... })
table.on('row:resize', ({ row, height }) => { ... })
table.on('data:patch', ({ patches }) => { ... })
table.on('command:execute', ({ changes }) => { ... })  // sync with DB
table.on('command:undo', ({ changes }) => { ... })
table.on('command:redo', ({ changes }) => { ... })

// Unsubscribe
const unsub = table.on('cell:change', handler);
unsub();
```

### Themes

```typescript
import { THEME_LIGHT, THEME_DARK, THEME_MINIMAL } from 'wandertable';

new WanderTable(el, { theme: THEME_DARK });
```

Or define your own via CSS variables:

```css
.wt-root {
  --wt-bg: #0f172a;
  --wt-cell-bg: #1e293b;
  --wt-cell-text: #e2e8f0;
  --wt-header-bg: #0f172a;
  --wt-header-text: #94a3b8;
  --wt-grid-line: #334155;
  --wt-sel-bg: rgba(59, 130, 246, 0.15);
  --wt-sel-border: #3b82f6;
  --wt-focus-border: #60a5fa;
  --wt-font: 'Inter', sans-serif;
  --wt-font-size: 13px;
  --wt-header-font-size: 12px;
  --wt-cell-padding: 8px;
  --wt-header-height: 28px;
  --wt-row-header-width: 50px;
}
```

### Fill Handle

Drag the small square at the bottom-right corner of a selection to fill cells.

```typescript
new WanderTable(el, {
  allowFillHandle: true, // default: true

  // Optional: override default fill behavior
  onFill: (source, fill, direction) => {
    // direction: 'down' | 'up' | 'right' | 'left' | 'diagonal'

    // Return CellPatch[] for custom values
    // Return true to cancel fill
    // Return void to use default (repeat pattern)
  },
});
```

### Column Reorder

```typescript
new WanderTable(el, {
  allowColReorder: true, // drag column headers to reorder
});

table.reorderColumn(fromCol, toCol); // programmatic
```

### Row Grouping

```typescript
new WanderTable(el, {
  rowGroups: [
    { startRow: 0, count: 5, label: 'Group 1', expanded: true },
    { startRow: 6, count: 3, label: 'Group 2', expanded: false },
  ],
});

table.addRowGroup(startRow, count, label);
table.toggleRowGroup(startRow);
table.expandAllGroups();
table.collapseAllGroups();
```

### Lazy Loading

```typescript
new WanderTable(el, {
  onLoadMore: (direction) => {
    // direction: 'down' | 'right'
    fetchMoreData().then(rows => {
      table.applyPatch(rows);
    });
  },
});
```

### Infinite Mode

```typescript
new WanderTable(el, {
  infinite: true,  // grid expands as you navigate/scroll beyond bounds
  rowCount: 50,    // initial size
  colCount: 26,
});
```

### Utilities

```typescript
import { columnLabel } from 'wandertable';

columnLabel(0)   // 'A'
columnLabel(25)  // 'Z'
columnLabel(26)  // 'AA'
columnLabel(701) // 'ZZ'
columnLabel(702) // 'AAA'
```

## Build Output

| File | Size | Description |
|------|------|-------------|
| `dist/wandertable.js` | ~112 KB | ESM module |
| `dist/wandertable.cjs` | ~85 KB | CommonJS module |
| `dist/wandertable.umd.js` | ~85 KB | UMD module |
| `dist/wandertable.global.js` | ~85 KB | IIFE standalone (`window.WanderTable`) |
| `dist/style.css` | ~8 KB | Styles |
| `dist/types/` | | TypeScript declarations |

## Development

```bash
npm install
npm run dev          # dev server at http://localhost:5173
npm run build        # build library (ESM + CJS + types + CSS)
npm run typecheck    # type check
npm run test         # run 47 unit tests
npm run test:watch   # tests in watch mode
```

## CI/CD

- **CI** (`.github/workflows/ci.yml`): Runs on push/PR to main. Typecheck + tests + build on Node 20 and 22.
- **Publish** (`.github/workflows/publish.yml`): Publishes to npm on GitHub release. Requires `NPM_TOKEN` secret.

## License

MIT
