import { describe, it, expect } from 'vitest';
import { MergeModel } from '../core/MergeModel.js';

describe('MergeModel', () => {
  it('should add and query merges', () => {
    const mm = new MergeModel();
    mm.addMerge({ row: 0, col: 0, rowSpan: 2, colSpan: 3 });

    expect(mm.isAnchor(0, 0)).toBe(true);
    expect(mm.isHidden(0, 1)).toBe(true);
    expect(mm.isHidden(0, 2)).toBe(true);
    expect(mm.isHidden(1, 0)).toBe(true);
    expect(mm.isHidden(1, 2)).toBe(true);
    expect(mm.isAnchor(0, 1)).toBe(false);
    expect(mm.isHidden(2, 0)).toBe(false); // outside merge
  });

  it('should remove merge', () => {
    const mm = new MergeModel();
    mm.addMerge({ row: 0, col: 0, rowSpan: 2, colSpan: 2 });
    mm.removeMerge(0, 0);

    expect(mm.isAnchor(0, 0)).toBe(false);
    expect(mm.isHidden(0, 1)).toBe(false);
    expect(mm.isHidden(1, 0)).toBe(false);
  });

  it('should not add 1x1 merge', () => {
    const mm = new MergeModel();
    mm.addMerge({ row: 0, col: 0, rowSpan: 1, colSpan: 1 });
    expect(mm.getAll()).toHaveLength(0);
  });

  it('getMerge returns the merge covering a cell', () => {
    const mm = new MergeModel();
    mm.addMerge({ row: 2, col: 3, rowSpan: 3, colSpan: 2 });

    const m = mm.getMerge(3, 4);
    expect(m).not.toBeNull();
    expect(m!.row).toBe(2);
    expect(m!.col).toBe(3);

    expect(mm.getMerge(0, 0)).toBeNull();
  });

  it('should clear all merges', () => {
    const mm = new MergeModel();
    mm.addMerge({ row: 0, col: 0, rowSpan: 2, colSpan: 2 });
    mm.addMerge({ row: 5, col: 5, rowSpan: 3, colSpan: 3 });
    mm.clear();
    expect(mm.getAll()).toHaveLength(0);
    expect(mm.isAnchor(0, 0)).toBe(false);
  });
});
