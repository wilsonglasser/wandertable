// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { ContextMenu, resolveMenuEntries, type MenuContext, type MenuItemConfig } from '../../plugins/ContextMenu.js';

const ctx: MenuContext = {
  target: 'cell', row: 0, col: 0, selectedCount: 1, isMultiSelect: false,
  isFullRow: false, isFullCol: false, readOnly: false, canUndo: true, canRedo: false,
};

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const key = (k: string) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

describe('context menu submenus', () => {
  let menu: ContextMenu;
  let ran: string[];

  const items = (): MenuItemConfig[] => [
    { id: 'copy', label: 'Copy', icon: 'ph ph-copy', action: () => ran.push('copy') },
    {
      id: 'specialPaste', label: 'Special paste', icon: 'ph ph-clipboard', children: [
        { label: 'Type', action: () => ran.push('type') },
        { label: 'Formula', action: () => ran.push('formula') },
      ],
    },
    { label: 'Hidden parent', children: [{ label: 'Off', visible: false }] },
  ];

  afterEach(() => menu?.destroy());

  it('drops a parent whose children all resolve away', () => {
    const labels = resolveMenuEntries(items(), ctx).map((e) => (e.type === 'item' ? e.item.label : '---'));
    expect(labels).toEqual(['Copy', 'Special paste']);
  });

  it('exposes an ARIA menu with icons and a submenu parent', async () => {
    ran = [];
    menu = new ContextMenu();
    menu.open(10, 10, items(), ctx);
    await frame();
    const [root] = menu.elements;
    expect(root.getAttribute('role')).toBe('menu');
    const rows = [...root.querySelectorAll<HTMLElement>('[role=menuitem]')];
    expect(rows.map((r) => r.textContent?.trim().startsWith('Copy') || r.textContent?.includes('Special paste'))).toEqual([true, true]);
    expect(rows[0].querySelector('i.ph-copy')?.getAttribute('aria-hidden')).toBe('true');
    expect(rows[1].getAttribute('aria-haspopup')).toBe('menu');
    expect(rows[1].getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(rows[0]);
  });

  it('marks checkable choices with menuitemcheckbox and aria-checked', async () => {
    ran = [];
    menu = new ContextMenu();
    menu.open(10, 10, [
      { label: 'Number', checked: true, action: () => ran.push('number') },
      { label: 'Text', checked: () => false, action: () => ran.push('text') },
      { label: 'Plain', action: () => ran.push('plain') },
    ], ctx);
    await frame();
    const [root] = menu.elements;
    const checks = [...root.querySelectorAll<HTMLElement>('[role=menuitemcheckbox]')];
    expect(checks.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(root.querySelectorAll('[role=menuitem]')).toHaveLength(1);
    expect(checks[0].querySelector('.wt-context-menu-check')?.getAttribute('aria-hidden')).toBe('true');
    expect(checks[1].querySelector('.wt-context-menu-check')).toBeNull();
    key('ArrowDown');
    key('Enter');
    expect(ran).toEqual(['text']);
  });

  it('opens the submenu with ArrowRight, runs a child with Enter, and closes one level with ArrowLeft', async () => {
    ran = [];
    menu = new ContextMenu();
    menu.open(10, 10, items(), ctx);
    await frame();
    key('ArrowDown');
    key('ArrowRight');
    expect(menu.elements).toHaveLength(2);
    const parent = menu.elements[0].querySelectorAll<HTMLElement>('[role=menuitem]')[1];
    expect(parent.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement?.textContent).toContain('Type');
    key('ArrowLeft');
    expect(menu.elements).toHaveLength(1);
    expect(document.activeElement).toBe(parent);
    key('ArrowRight');
    key('ArrowDown');
    key('Enter');
    expect(ran).toEqual(['formula']);
    expect(menu.isOpen).toBe(false);
  });

  it('opens the submenu on hover and closes it when hovering a sibling', async () => {
    ran = [];
    menu = new ContextMenu();
    menu.open(10, 10, items(), ctx);
    await frame();
    const rows = menu.elements[0].querySelectorAll<HTMLElement>('[role=menuitem]');
    rows[1].dispatchEvent(new MouseEvent('mouseenter'));
    expect(menu.elements).toHaveLength(2);
    rows[0].dispatchEvent(new MouseEvent('mouseenter'));
    expect(menu.elements).toHaveLength(1);
    rows[1].dispatchEvent(new MouseEvent('mouseenter'));
    menu.elements[1].querySelector<HTMLElement>('[role=menuitem]')!.click();
    expect(ran).toEqual(['type']);
  });

  it('Escape closes the submenu first, then the menu', async () => {
    ran = [];
    menu = new ContextMenu();
    menu.open(10, 10, items(), ctx);
    await frame();
    key('ArrowDown');
    key('ArrowRight');
    key('Escape');
    expect(menu.elements).toHaveLength(1);
    key('Escape');
    expect(menu.isOpen).toBe(false);
  });
});
