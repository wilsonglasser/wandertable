import type { ColumnConfig } from '../types/index.js';

export interface HeaderCell {
  label: string;
  colSpan: number;
  rowSpan: number;
  col: number;      // start column index (in flat columns)
  level: number;     // header row (0 = top)
  config?: ColumnConfig;
}

/**
 * Flatten nested ColumnConfig[] into:
 * - flatColumns: leaf columns only (the actual data columns)
 * - headerRows: 2D array of header cells for multi-level rendering
 */
export function flattenColumns(columns: ColumnConfig[]): {
  flatColumns: ColumnConfig[];
  headerRows: HeaderCell[][];
  maxDepth: number;
} {
  const flatColumns: ColumnConfig[] = [];
  const maxDepth = getMaxDepth(columns);
  const headerRows: HeaderCell[][] = [];

  for (let i = 0; i < maxDepth; i++) {
    headerRows.push([]);
  }

  flattenRecursive(columns, 0, flatColumns, headerRows, maxDepth);

  return { flatColumns, headerRows, maxDepth };
}

function getMaxDepth(columns: ColumnConfig[]): number {
  let max = 1;
  for (const col of columns) {
    if (col.children && col.children.length > 0) {
      max = Math.max(max, 1 + getMaxDepth(col.children));
    }
  }
  return max;
}

function flattenRecursive(
  columns: ColumnConfig[],
  level: number,
  flatColumns: ColumnConfig[],
  headerRows: HeaderCell[][],
  maxDepth: number,
): void {
  for (const col of columns) {
    if (col.children && col.children.length > 0) {
      // Group header
      const startCol = flatColumns.length;
      flattenRecursive(col.children, level + 1, flatColumns, headerRows, maxDepth);
      const colSpan = flatColumns.length - startCol;

      headerRows[level].push({
        label: col.label ?? '',
        colSpan,
        rowSpan: 1,
        col: startCol,
        level,
        config: col,
      });
    } else {
      // Leaf column
      const colIdx = flatColumns.length;
      flatColumns.push(col);

      // Leaf spans from current level down to maxDepth
      const rowSpan = maxDepth - level;
      headerRows[level].push({
        label: col.label ?? '',
        colSpan: 1,
        rowSpan,
        col: colIdx,
        level,
        config: col,
      });
    }
  }
}
