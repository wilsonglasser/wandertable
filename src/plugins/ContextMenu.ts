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
  /** Stable key of a built-in item (e.g. 'insertRowAbove'), to filter or relabel it. */
  id?: string;
  label: string;
  shortcut?: string;
  /** Static boolean or callback evaluated at open time */
  disabled?: boolean | ((ctx: MenuContext) => boolean);
  /** Static boolean or callback - if false, item is not rendered */
  visible?: boolean | ((ctx: MenuContext) => boolean);
  separator?: boolean;
  action?: (ctx: MenuContext) => void;
  /** CSS class(es) of an icon shown before the label (rendered as <i aria-hidden>). */
  icon?: string;
  /** Items of a submenu. An item whose children all resolve away is dropped. */
  children?: MenuItemConfig[];
  /**
   * Marks the item as a checkable choice (role menuitemcheckbox with aria-checked),
   * e.g. the current value in a "pick one" submenu. Undefined keeps a plain menuitem.
   */
  checked?: boolean | ((ctx: MenuContext) => boolean);
}

/** A resolved, renderable menu entry: either a separator or a concrete item. */
export type ResolvedMenuEntry =
  | { type: 'separator' }
  | { type: 'item'; item: MenuItemConfig; children?: ResolvedMenuEntry[]; checked?: boolean };

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
    if (item.children) {
      const children = resolveMenuEntries(item.children, ctx);
      if (children.length === 0 && !item.action) {
        continue;
      }
      kept.push({ type: 'item', item, children });
      continue;
    }
    if (item.checked !== undefined) {
      kept.push({ type: 'item', item, checked: typeof item.checked === 'function' ? item.checked(ctx) : item.checked });
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

interface MenuLevel {
  el: HTMLElement;
  rows: HTMLElement[];
  entries: Extract<ResolvedMenuEntry, { type: 'item' }>[];
  /** Row (in the level below) that opened this submenu. */
  parentRow: HTMLElement | null;
}

let menuUid = 0;

/**
 * Context menu with nested submenus. ARIA menu pattern: role=menu/menuitem,
 * aria-haspopup + aria-expanded on submenu parents, roving focus. Keys:
 * ArrowUp/Down, Home/End, Enter/Space (run or open), ArrowRight opens a
 * submenu, ArrowLeft/Escape closes one level, Tab closes everything.
 */
export class ContextMenu {
  private levels: MenuLevel[] = [];
  private ctx: MenuContext | null = null;
  private returnFocus: HTMLElement | null = null;
  private uid = ++menuUid;

  private closeHandler = (e: MouseEvent) => {
    if (!this.levels.some((level) => level.el.contains(e.target as Node))) {
      this.close();
    }
  };

  private keyHandler = (e: KeyboardEvent) => {
    const level = this.levels[this.levels.length - 1];
    if (!level) return;
    const index = level.rows.indexOf(document.activeElement as HTMLElement);
    const focus = (i: number) => {
      if (level.rows.length === 0) return;
      const next = (i + level.rows.length) % level.rows.length;
      level.rows[next].focus({ preventScroll: true });
    };
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focus(index + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focus(index < 0 ? level.rows.length - 1 : index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focus(0);
        break;
      case 'End':
        e.preventDefault();
        focus(level.rows.length - 1);
        break;
      case 'ArrowRight':
        if (index >= 0 && level.entries[index].children) {
          e.preventDefault();
          this.openSubmenu(this.levels.length - 1, index, true);
        }
        break;
      case 'ArrowLeft':
        if (this.levels.length > 1) {
          e.preventDefault();
          this.closeLevelsFrom(this.levels.length - 1, true);
        }
        break;
      case 'Escape':
        e.preventDefault();
        if (this.levels.length > 1) {
          this.closeLevelsFrom(this.levels.length - 1, true);
        } else {
          this.close();
        }
        break;
      case 'Enter':
      case ' ':
        if (index >= 0) {
          e.preventDefault();
          this.activate(this.levels.length - 1, index, true);
        }
        break;
      case 'Tab':
        this.close();
        break;
    }
  };

  open(x: number, y: number, items: MenuItemConfig[], ctx: MenuContext): void {
    this.close();
    this.ctx = ctx;
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const entries = resolveMenuEntries(items, ctx);
    const level = this.buildLevel(entries, null);
    document.body.appendChild(level.el);
    this.place(level.el, x, y);
    this.levels.push(level);
    level.rows[0]?.focus({ preventScroll: true });

    requestAnimationFrame(() => {
      document.addEventListener('mousedown', this.closeHandler);
      document.addEventListener('keydown', this.keyHandler, true);
    });
  }

  private buildLevel(entries: ResolvedMenuEntry[], parentRow: HTMLElement | null): MenuLevel {
    const el = document.createElement('div');
    el.className = parentRow ? 'wt-context-menu wt-context-menu--sub' : 'wt-context-menu';
    el.setAttribute('role', 'menu');
    if (parentRow) {
      el.id = parentRow.id + '-menu';
      el.setAttribute('aria-labelledby', parentRow.id);
    }

    const level: MenuLevel = { el, rows: [], entries: [], parentRow };
    const depth = this.levels.length;

    // Disabled items are omitted entirely (see resolveMenuEntries), so every
    // item rendered here is actionable.
    for (const entry of entries) {
      if (entry.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'wt-context-menu-separator';
        sep.setAttribute('role', 'separator');
        el.appendChild(sep);
        continue;
      }

      const item = entry.item;
      const row = document.createElement('div');
      row.className = 'wt-context-menu-item';
      if (entry.checked === undefined) {
        row.setAttribute('role', 'menuitem');
      } else {
        row.setAttribute('role', 'menuitemcheckbox');
        row.setAttribute('aria-checked', String(entry.checked));
        if (entry.checked) row.classList.add('wt-context-menu-item--checked');
      }
      row.tabIndex = -1;
      row.id = `wt-menu-${this.uid}-${depth}-${level.rows.length}`;

      const icon = document.createElement('i');
      icon.className = 'wt-context-menu-icon' + (item.icon ? ' ' + item.icon : '');
      icon.setAttribute('aria-hidden', 'true');
      row.appendChild(icon);

      const label = document.createElement('span');
      label.className = 'wt-context-menu-label';
      label.textContent = item.label;
      row.appendChild(label);

      if (entry.children) {
        row.setAttribute('aria-haspopup', 'menu');
        row.setAttribute('aria-expanded', 'false');
        const caret = document.createElement('span');
        caret.className = 'wt-context-menu-caret';
        caret.setAttribute('aria-hidden', 'true');
        caret.textContent = '\u203A';
        row.appendChild(caret);
      } else if (entry.checked) {
        const check = document.createElement('span');
        check.className = 'wt-context-menu-check';
        check.setAttribute('aria-hidden', 'true');
        check.textContent = '\u2713';
        row.appendChild(check);
      } else if (item.shortcut) {
        const shortcut = document.createElement('span');
        shortcut.className = 'wt-context-menu-shortcut';
        shortcut.textContent = item.shortcut;
        row.appendChild(shortcut);
      }

      const index = level.rows.length;
      row.addEventListener('mouseenter', () => {
        const levelIndex = this.levels.indexOf(level);
        if (levelIndex < 0) return;
        row.focus({ preventScroll: true });
        if (entry.children) {
          this.openSubmenu(levelIndex, index, false);
        } else {
          this.closeLevelsFrom(levelIndex + 1, false);
        }
      });
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        const levelIndex = this.levels.indexOf(level);
        if (levelIndex >= 0) this.activate(levelIndex, index, false);
      });

      el.appendChild(row);
      level.rows.push(row);
      level.entries.push(entry);
    }

    // Icon column only when this level has icons, so labels stay aligned.
    if (level.entries.some((entry) => entry.item.icon)) {
      el.classList.add('wt-context-menu--icons');
    }

    return level;
  }

  /** Run an item, or open its submenu. */
  private activate(levelIndex: number, index: number, fromKeyboard: boolean): void {
    const level = this.levels[levelIndex];
    const entry = level?.entries[index];
    if (!entry || !this.ctx) return;
    if (entry.children) {
      this.openSubmenu(levelIndex, index, fromKeyboard);
      return;
    }
    const action = entry.item.action;
    const ctx = this.ctx;
    this.close();
    action?.(ctx);
  }

  private openSubmenu(levelIndex: number, index: number, focusFirst: boolean): void {
    const level = this.levels[levelIndex];
    const entry = level.entries[index];
    const row = level.rows[index];
    const open = this.levels[levelIndex + 1];
    if (open && open.parentRow === row) {
      if (focusFirst) open.rows[0]?.focus({ preventScroll: true });
      return;
    }
    this.closeLevelsFrom(levelIndex + 1, false);
    if (!entry.children) return;

    const sub = this.buildLevel(entry.children, row);
    document.body.appendChild(sub.el);
    row.setAttribute('aria-expanded', 'true');
    row.setAttribute('aria-controls', sub.el.id);

    // Beside the parent row; flips to the left side near the viewport edge.
    const rowRect = row.getBoundingClientRect();
    const subRect = sub.el.getBoundingClientRect();
    let x = rowRect.right - 2;
    if (x + subRect.width > window.innerWidth) x = rowRect.left - subRect.width + 2;
    this.place(sub.el, x, rowRect.top - 4);

    this.levels.push(sub);
    if (focusFirst) sub.rows[0]?.focus({ preventScroll: true });
  }

  /** Close submenu levels from `levelIndex` up; optionally focus the row that opened them. */
  private closeLevelsFrom(levelIndex: number, focusParent: boolean): void {
    while (this.levels.length > levelIndex && this.levels.length > 0) {
      const level = this.levels.pop()!;
      level.el.remove();
      if (level.parentRow) {
        level.parentRow.setAttribute('aria-expanded', 'false');
        level.parentRow.removeAttribute('aria-controls');
        if (focusParent && this.levels.length === levelIndex) level.parentRow.focus({ preventScroll: true });
      }
    }
  }

  private place(el: HTMLElement, x: number, y: number): void {
    const rect = el.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
    el.style.left = `${Math.max(0, x)}px`;
    el.style.top = `${Math.max(0, y)}px`;
  }

  close(): void {
    const wasOpen = this.levels.length > 0;
    this.closeLevelsFrom(0, false);
    this.ctx = null;
    document.removeEventListener('mousedown', this.closeHandler);
    document.removeEventListener('keydown', this.keyHandler, true);
    if (wasOpen && this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
    this.returnFocus = null;
  }

  get isOpen(): boolean {
    return this.levels.length > 0;
  }

  /** Open menu levels (root first), for hosts and tests. */
  get elements(): HTMLElement[] {
    return this.levels.map((level) => level.el);
  }

  destroy(): void {
    this.close();
  }
}
