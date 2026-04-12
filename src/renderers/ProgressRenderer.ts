import type { CellData, CellRenderer, CellState } from '../types/index.js';

export class ProgressRenderer implements CellRenderer {
  render(cell: HTMLElement, data: CellData | undefined, _state: CellState): void {
    if (data?.value == null) {
      cell.textContent = '';
      return;
    }

    const value = Math.max(0, Math.min(100, Number(data.value)));
    if (isNaN(value)) {
      cell.textContent = '';
      return;
    }

    const color = value >= 80 ? '#22c55e' : value >= 50 ? '#f59e0b' : value >= 25 ? '#f97316' : '#ef4444';

    cell.innerHTML = `<div class="wt-progress">
      <div class="wt-progress-bar" style="width:${value}%;background:${color}"></div>
      <span class="wt-progress-label">${Math.round(value)}%</span>
    </div>`;
  }
}
