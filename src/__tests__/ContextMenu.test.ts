import { describe, it, expect } from 'vitest';
import { resolveMenuEntries, type MenuItemConfig, type MenuContext } from '../plugins/ContextMenu.js';

function ctx(overrides: Partial<MenuContext> = {}): MenuContext {
  return {
    target: 'column-header',
    row: -1,
    col: 0,
    selectedCount: 0,
    isMultiSelect: false,
    isFullRow: false,
    isFullCol: false,
    readOnly: false,
    canUndo: false,
    canRedo: false,
    ...overrides,
  };
}

function labels(items: MenuItemConfig[], c: MenuContext): (string | '---')[] {
  return resolveMenuEntries(items, c).map((e) => (e.type === 'separator' ? '---' : e.item.label));
}

describe('resolveMenuEntries', () => {
  it('omits disabled items entirely instead of keeping them greyed-out', () => {
    const items: MenuItemConfig[] = [
      { label: 'Sort ascending' },
      { label: 'Insert column left', disabled: (c) => c.readOnly },
      { label: 'Undo', disabled: (c) => !c.canUndo },
    ];
    expect(labels(items, ctx({ readOnly: true }))).toEqual(['Sort ascending']);
  });

  it('keeps enabled items', () => {
    const items: MenuItemConfig[] = [
      { label: 'Insert column left', disabled: (c) => c.readOnly },
      { label: 'Undo', disabled: (c) => !c.canUndo },
    ];
    expect(labels(items, ctx({ readOnly: false, canUndo: true }))).toEqual([
      'Insert column left',
      'Undo',
    ]);
  });

  it('drops separators left dangling by removed items (leading/trailing/consecutive)', () => {
    const items: MenuItemConfig[] = [
      { label: '', separator: true },
      { label: 'Sort ascending' },
      { label: '', separator: true },
      { label: 'Insert column left', disabled: true },
      { label: '', separator: true },
      { label: 'Undo', disabled: true },
      { label: '', separator: true },
    ];
    // Leading sep dropped, the run of seps around the two disabled items collapses
    // to nothing meaningful, trailing sep dropped.
    expect(labels(items, ctx())).toEqual(['Sort ascending']);
  });

  it('collapses consecutive separators down to a single one between visible items', () => {
    const items: MenuItemConfig[] = [
      { label: 'A' },
      { label: '', separator: true },
      { label: 'gone', disabled: true },
      { label: '', separator: true },
      { label: 'B' },
    ];
    expect(labels(items, ctx())).toEqual(['A', '---', 'B']);
  });

  it('respects the visible predicate independently of disabled', () => {
    const items: MenuItemConfig[] = [
      { label: 'cell-only', visible: (c) => c.target === 'cell' },
      { label: 'always' },
    ];
    expect(labels(items, ctx({ target: 'column-header' }))).toEqual(['always']);
  });
});
