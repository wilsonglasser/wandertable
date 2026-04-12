export type MenuTarget = 'cell' | 'column-header' | 'row-header';

/** Context for evaluating dynamic menu item properties */
export interface MenuContext {
  /** What was right-clicked */
  target: MenuTarget;
  /** Row where the right-click happened (-1 for column headers) */
  row: number;
  /** Column where the right-click happened (-1 for row headers) */
  col: number;
  /** Number of selected cells */
  selectedCount: number;
  /** Whether multiple cells are selected */
  isMultiSelect: boolean;
  /** Whether an entire row is selected */
  isFullRow: boolean;
  /** Whether an entire column is selected */
  isFullCol: boolean;
  /** Whether the grid is readOnly */
  readOnly: boolean;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
}

export interface MenuItemConfig {
  label: string;
  shortcut?: string;
  /** Static boolean or callback evaluated at open time */
  disabled?: boolean | ((ctx: MenuContext) => boolean);
  /** Static boolean or callback - if false, item is not rendered */
  visible?: boolean | ((ctx: MenuContext) => boolean);
  separator?: boolean;
  action?: (ctx: MenuContext) => void;
}

export class ContextMenu {
  private el: HTMLElement | null = null;
  private closeHandler = (e: MouseEvent) => {
    if (this.el && !this.el.contains(e.target as Node)) {
      this.close();
    }
  };
  private keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
  };

  open(x: number, y: number, items: MenuItemConfig[], ctx: MenuContext): void {
    this.close();

    this.el = document.createElement('div');
    this.el.className = 'wt-context-menu';

    for (const item of items) {
      // Evaluate visibility
      const visible = typeof item.visible === 'function'
        ? item.visible(ctx)
        : (item.visible ?? true);
      if (!visible) continue;

      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'wt-context-menu-separator';
        this.el.appendChild(sep);
        continue;
      }

      // Evaluate disabled
      const disabled = typeof item.disabled === 'function'
        ? item.disabled(ctx)
        : (item.disabled ?? false);

      const row = document.createElement('div');
      row.className = 'wt-context-menu-item';
      if (disabled) row.classList.add('wt-context-menu-item--disabled');

      const label = document.createElement('span');
      label.textContent = item.label;
      row.appendChild(label);

      if (item.shortcut) {
        const shortcut = document.createElement('span');
        shortcut.className = 'wt-context-menu-shortcut';
        shortcut.textContent = item.shortcut;
        row.appendChild(shortcut);
      }

      if (!disabled && item.action) {
        const action = item.action;
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          this.close();
          action(ctx);
        });
      }

      this.el.appendChild(row);
    }

    document.body.appendChild(this.el);

    // Adjust position to stay in viewport
    const rect = this.el.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
    this.el.style.left = `${Math.max(0, x)}px`;
    this.el.style.top = `${Math.max(0, y)}px`;

    requestAnimationFrame(() => {
      document.addEventListener('mousedown', this.closeHandler);
      document.addEventListener('keydown', this.keyHandler);
    });
  }

  close(): void {
    if (this.el) {
      this.el.remove();
      this.el = null;
    }
    document.removeEventListener('mousedown', this.closeHandler);
    document.removeEventListener('keydown', this.keyHandler);
  }

  get isOpen(): boolean {
    return this.el !== null;
  }

  destroy(): void {
    this.close();
  }
}
