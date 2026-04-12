import type { CellData, CellRenderer, CellState } from '../types/index.js';

export class NumberRenderer implements CellRenderer {
  private formatter: Intl.NumberFormat;

  constructor(locale?: string, options?: Intl.NumberFormatOptions) {
    this.formatter = new Intl.NumberFormat(locale, options);
  }

  render(cell: HTMLElement, data: CellData | undefined, _state: CellState): void {
    if (data?.value == null || data.value === '') {
      cell.textContent = '';
      return;
    }

    const num = Number(data.value);
    if (isNaN(num)) {
      cell.textContent = String(data.value);
      return;
    }

    cell.textContent = this.formatter.format(num);
    cell.style.textAlign = 'right';
  }
}
