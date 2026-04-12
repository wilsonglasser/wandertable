import type { CellData, CellRenderer, CellState } from '../types/index.js';

export class TextRenderer implements CellRenderer {
  render(cell: HTMLElement, data: CellData | undefined, _state: CellState): void {
    const value = data?.value;
    if (value == null || value === '') {
      cell.textContent = '';
      return;
    }
    cell.textContent = String(value);
  }
}
