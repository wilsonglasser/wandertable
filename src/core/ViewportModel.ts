import type { Viewport } from '../types/index.js';
import type { ColumnModel } from '../columns/ColumnModel.js';
import type { RowModel } from '../rows/RowModel.js';

export class ViewportModel {
  private overscan: number;

  constructor(overscan = 3) {
    this.overscan = overscan;
  }

  calculate(
    scrollX: number,
    scrollY: number,
    containerWidth: number,
    containerHeight: number,
    colModel: ColumnModel,
    rowModel: RowModel,
  ): Viewport {
    // Find visible rows
    const rawStartRow = rowModel.getRowAtY(scrollY);
    const rawEndRow = rowModel.getRowAtY(scrollY + containerHeight);
    const startRow = Math.max(0, rawStartRow - this.overscan);
    const endRow = Math.min(rowModel.count - 1, rawEndRow + this.overscan);

    // Find visible cols
    const rawStartCol = colModel.getColAtX(scrollX);
    const rawEndCol = colModel.getColAtX(scrollX + containerWidth);
    const startCol = Math.max(0, rawStartCol - this.overscan);
    const endCol = Math.min(colModel.count - 1, rawEndCol + this.overscan);

    return { startRow, endRow, startCol, endCol, scrollX, scrollY };
  }
}
