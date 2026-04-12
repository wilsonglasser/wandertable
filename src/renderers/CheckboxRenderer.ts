import type { CellData, CellRenderer, CellState } from '../types/index.js';

export class CheckboxRenderer implements CellRenderer {
  render(cell: HTMLElement, data: CellData | undefined, _state: CellState): void {
    const checked = !!data?.value;
    cell.innerHTML = `<label class="wt-checkbox">
      <span class="wt-checkbox-box${checked ? ' wt-checkbox-box--checked' : ''}">
        ${checked ? '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}
      </span>
    </label>`;
  }
}
