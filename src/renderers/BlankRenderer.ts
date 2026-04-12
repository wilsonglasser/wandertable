import type { CellData, CellRenderer, CellState } from '../types/index.js';

/**
 * Renderer for blank/empty cells.
 * Shows nothing and can optionally call a callback on render (e.g. for tracking).
 */
export class BlankRenderer implements CellRenderer {
  render(cell: HTMLElement, _data: CellData | undefined, _state: CellState): void {
    cell.textContent = '';
  }
}
