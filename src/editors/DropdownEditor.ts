import type { CellBounds, CellData, CellEditor, DropdownConfig, DropdownOption } from '../types/index.js';

export class DropdownEditor implements CellEditor {
  private config: DropdownConfig;
  private container!: HTMLElement;
  private listEl!: HTMLElement;
  private searchInput: HTMLInputElement | null = null;
  private selected: Set<unknown> = new Set();
  private options: DropdownOption[] = [];
  private highlightIndex = -1;
  private searchInputHandler: (() => void) | null = null;

  constructor(config: DropdownConfig) {
    this.config = config;
  }

  createElement(parent: HTMLElement): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'wt-dropdown';

    if (this.config.searchable) {
      this.searchInput = document.createElement('input');
      this.searchInput.type = 'text';
      this.searchInput.className = 'wt-dropdown-search';
      this.searchInput.placeholder = this.config.placeholder ?? 'Search...';
      this.container.appendChild(this.searchInput);

      this.searchInputHandler = () => {
        this.loadOptions(this.searchInput!.value);
      };
      this.searchInput.addEventListener('input', this.searchInputHandler);
    }

    this.listEl = document.createElement('div');
    this.listEl.className = 'wt-dropdown-list';
    this.container.appendChild(this.listEl);

    // Event delegation for item clicks
    this.listEl.addEventListener('click', this.handleItemClick);

    parent.appendChild(this.container);

    this.container.addEventListener('keydown', this.handleKey);

    return this.container;
  }

  open(value: unknown, _bounds: CellBounds, _cellData: CellData | undefined): void {
    // Initialize selected values
    if (this.config.multiple && Array.isArray(value)) {
      this.selected = new Set(value);
    } else if (value != null) {
      this.selected = new Set([value]);
    }

    this.loadOptions('');

    requestAnimationFrame(() => {
      if (this.searchInput) {
        this.searchInput.focus({ preventScroll: true });
      } else {
        this.container.focus({ preventScroll: true });
      }
    });
  }

  getValue(): unknown {
    if (this.config.multiple) {
      return Array.from(this.selected);
    }
    return this.selected.size > 0 ? this.selected.values().next().value : null;
  }

  close(): void {
    if (this.searchInput && this.searchInputHandler) {
      this.searchInput.removeEventListener('input', this.searchInputHandler);
    }
    this.listEl.removeEventListener('click', this.handleItemClick);
    this.container.removeEventListener('keydown', this.handleKey);
    this.container.remove();
  }

  private handleItemClick = (e: MouseEvent): void => {
    const target = (e.target as HTMLElement).closest('.wt-dropdown-item') as HTMLElement | null;
    if (!target) return;
    e.stopPropagation();
    const idx = parseInt(target.dataset.index ?? '', 10);
    if (isNaN(idx) || idx < 0 || idx >= this.options.length) return;
    const opt = this.options[idx];
    if (opt.disabled) return;
    this.selectOption(opt);
  };

  private async loadOptions(query: string): Promise<void> {
    if (this.config.source) {
      this.options = await this.config.source(query, 0, 0);
    } else if (this.config.options) {
      const q = query.toLowerCase();
      this.options = q
        ? this.config.options.filter(o => o.label.toLowerCase().includes(q))
        : this.config.options;
    }
    this.renderOptions();
  }

  private renderOptions(): void {
    this.listEl.innerHTML = '';
    this.highlightIndex = -1;

    for (let i = 0; i < this.options.length; i++) {
      const opt = this.options[i];
      const el = document.createElement('div');
      el.className = 'wt-dropdown-item';
      el.dataset.index = String(i);
      if (this.selected.has(opt.value)) el.classList.add('wt-dropdown-item--selected');
      if (opt.disabled) el.classList.add('wt-dropdown-item--disabled');

      if (this.config.renderOption) {
        this.config.renderOption(opt, el);
      } else {
        el.textContent = opt.label;
        if (opt.icon) {
          const icon = document.createElement('span');
          icon.className = 'wt-dropdown-icon';
          icon.textContent = opt.icon;
          el.prepend(icon);
        }
      }

      this.listEl.appendChild(el);
    }
  }

  private selectOption(opt: DropdownOption): void {
    if (this.config.multiple) {
      if (this.selected.has(opt.value)) {
        this.selected.delete(opt.value);
      } else {
        this.selected.add(opt.value);
      }
      this.renderOptions();
    } else {
      this.selected.clear();
      this.selected.add(opt.value);
    }
  }

  private handleKey = (e: KeyboardEvent): void => {
    const items = this.listEl.children;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.highlightIndex = Math.min(this.highlightIndex + 1, items.length - 1);
        this.updateHighlight();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.highlightIndex = Math.max(this.highlightIndex - 1, 0);
        this.updateHighlight();
        break;
      case 'Enter':
        e.preventDefault();
        if (this.highlightIndex >= 0 && this.highlightIndex < this.options.length) {
          this.selectOption(this.options[this.highlightIndex]);
        }
        break;
    }
  };

  private updateHighlight(): void {
    const items = this.listEl.children;
    for (let i = 0; i < items.length; i++) {
      items[i].classList.toggle('wt-dropdown-item--highlight', i === this.highlightIndex);
    }
    items[this.highlightIndex]?.scrollIntoView({ block: 'nearest' });
  }
}
