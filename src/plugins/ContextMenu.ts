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

/** A resolved, renderable menu entry: either a separator or a concrete item. */
export type ResolvedMenuEntry =
  | { type: 'separator' }
  | { type: 'item'; item: MenuItemConfig };

/**
 * Resolve the raw menu config into the list of entries that should actually be
 * rendered for the given context. Items hidden by `visible` are dropped, and
 * items that evaluate to `disabled` are OMITTED entirely (not shown greyed-out).
 * Any separators left dangling by the removals — leading, trailing, or
 * consecutive — are collapsed so the menu never shows empty dividers.
 *
 * Pure (no DOM) so it can be unit-tested without a browser environment.
 */
export function resolveMenuEntries(items: MenuItemConfig[], ctx: MenuContext): ResolvedMenuEntry[] {
  const kept: ResolvedMenuEntry[] = [];
  for (const item of items) {
    const visible = typeof item.visible === 'function' ? item.visible(ctx) : (item.visible ?? true);
    if (!visible) {
      continue;
    }
    if (item.separator) {
      kept.push({ type: 'separator' });
      continue;
    }
    const disabled = typeof item.disabled === 'function' ? item.disabled(ctx) : (item.disabled ?? false);
    if (disabled) {
      continue;
    }
    kept.push({ type: 'item', item });
  }

  // Collapse separators: drop leading/consecutive...
  const collapsed: ResolvedMenuEntry[] = [];
  let lastWasSeparator = true; // seeded true so a leading separator is dropped
  for (const entry of kept) {
    if (entry.type === 'separator') {
      if (lastWasSeparator) {
        continue;
      }
      lastWasSeparator = true;
      collapsed.push(entry);
    } else {
      lastWasSeparator = false;
      collapsed.push(entry);
    }
  }
  // ...and a trailing separator.
  while (collapsed.length > 0 && collapsed[collapsed.length - 1].type === 'separator') {
    collapsed.pop();
  }

  return collapsed;
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

    // Disabled items are omitted entirely (see resolveMenuEntries), so every
    // item we render here is actionable.
    for (const entry of resolveMenuEntries(items, ctx)) {
      if (entry.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'wt-context-menu-separator';
        this.el.appendChild(sep);
        continue;
      }

      const item = entry.item;
      const row = document.createElement('div');
      row.className = 'wt-context-menu-item';

      const label = document.createElement('span');
      label.textContent = item.label;
      row.appendChild(label);

      if (item.shortcut) {
        const shortcut = document.createElement('span');
        shortcut.className = 'wt-context-menu-shortcut';
        shortcut.textContent = item.shortcut;
        row.appendChild(shortcut);
      }

      if (item.action) {
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
