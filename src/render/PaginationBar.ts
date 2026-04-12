import type { PaginationState } from '../types/index.js';

export class PaginationBar {
  private el: HTMLElement;
  private infoEl: HTMLElement;
  private prevBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private firstBtn: HTMLButtonElement;
  private lastBtn: HTMLButtonElement;
  private pageInput: HTMLInputElement;

  private clickHandler: (e: MouseEvent) => void;
  private changeHandler: () => void;

  onPageChange: ((page: number) => void) | null = null;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'wt-pagination';

    this.infoEl = document.createElement('span');
    this.infoEl.className = 'wt-pagination-info';

    this.firstBtn = this.createBtn('first', '\u00AB');
    this.prevBtn = this.createBtn('prev', '\u2039');
    this.pageInput = document.createElement('input');
    this.pageInput.type = 'number';
    this.pageInput.className = 'wt-pagination-input';
    this.pageInput.min = '1';
    this.nextBtn = this.createBtn('next', '\u203A');
    this.lastBtn = this.createBtn('last', '\u00BB');

    this.el.appendChild(this.infoEl);
    this.el.appendChild(this.firstBtn);
    this.el.appendChild(this.prevBtn);
    this.el.appendChild(this.pageInput);
    this.el.appendChild(this.nextBtn);
    this.el.appendChild(this.lastBtn);

    // Event delegation for buttons
    this.clickHandler = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('.wt-pagination-btn') as HTMLElement | null;
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'first') this.onPageChange?.(0);
      else if (action === 'prev') this.onPageChange?.(-1);
      else if (action === 'next') this.onPageChange?.(-2);
      else if (action === 'last') this.onPageChange?.(-3);
    };
    this.el.addEventListener('click', this.clickHandler);

    // Page input change
    this.changeHandler = () => {
      const page = parseInt(this.pageInput.value, 10) - 1;
      if (!isNaN(page)) this.onPageChange?.(page);
    };
    this.pageInput.addEventListener('change', this.changeHandler);

    container.appendChild(this.el);
  }

  update(state: PaginationState): void {
    this.infoEl.textContent = `${state.startRow + 1}-${state.endRow} of ${state.totalRows}`;
    this.pageInput.value = String(state.page + 1);
    this.pageInput.max = String(state.totalPages);
    this.prevBtn.disabled = state.page <= 0;
    this.firstBtn.disabled = state.page <= 0;
    this.nextBtn.disabled = state.page >= state.totalPages - 1;
    this.lastBtn.disabled = state.page >= state.totalPages - 1;
  }

  show(): void {
    this.el.style.display = '';
  }

  hide(): void {
    this.el.style.display = 'none';
  }

  destroy(): void {
    this.el.removeEventListener('click', this.clickHandler);
    this.pageInput.removeEventListener('change', this.changeHandler);
    this.el.remove();
  }

  private createBtn(action: string, text: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'wt-pagination-btn';
    btn.dataset.action = action;
    btn.textContent = text;
    return btn;
  }
}
