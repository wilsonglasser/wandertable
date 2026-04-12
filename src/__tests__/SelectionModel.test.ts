import { describe, it, expect } from 'vitest';
import { SelectionModel } from '../core/SelectionModel.js';

describe('SelectionModel', () => {
  it('should focus a cell', () => {
    const sm = new SelectionModel(10, 10);
    sm.focusCell(3, 4);
    expect(sm.focus).toEqual({ row: 3, col: 4 });
    expect(sm.isFocused(3, 4)).toBe(true);
    expect(sm.isSelected(3, 4)).toBe(true);
    expect(sm.isSelected(0, 0)).toBe(false);
  });

  it('should extend selection', () => {
    const sm = new SelectionModel(10, 10);
    sm.focusCell(1, 1);
    sm.extendTo(3, 3);
    expect(sm.isSelected(1, 1)).toBe(true);
    expect(sm.isSelected(2, 2)).toBe(true);
    expect(sm.isSelected(3, 3)).toBe(true);
    expect(sm.isSelected(0, 0)).toBe(false);
  });

  it('should select entire column with Infinity', () => {
    const sm = new SelectionModel(100, 10);
    sm.selectColumn(2);
    expect(sm.isSelected(0, 2)).toBe(true);
    expect(sm.isSelected(99, 2)).toBe(true);
    expect(sm.isSelected(0, 3)).toBe(false);
  });

  it('should select entire row with Infinity', () => {
    const sm = new SelectionModel(10, 100);
    sm.selectRow(5);
    expect(sm.isSelected(5, 0)).toBe(true);
    expect(sm.isSelected(5, 99)).toBe(true);
    expect(sm.isSelected(4, 0)).toBe(false);
  });

  it('should move focus', () => {
    const sm = new SelectionModel(10, 10);
    sm.focusCell(5, 5);
    sm.move(1, 0, false);
    expect(sm.focus).toEqual({ row: 6, col: 5 });
    sm.move(0, -1, false);
    expect(sm.focus).toEqual({ row: 6, col: 4 });
  });

  it('should clamp to bounds', () => {
    const sm = new SelectionModel(10, 10);
    sm.focusCell(0, 0);
    sm.move(-1, 0, false);
    expect(sm.focus).toEqual({ row: 0, col: 0 });
    sm.focusCell(9, 9);
    sm.move(1, 0, false);
    expect(sm.focus).toEqual({ row: 9, col: 9 });
  });

  it('should not clamp in infinite mode', () => {
    const sm = new SelectionModel(10, 10);
    sm.infinite = true;
    sm.focusCell(9, 9);
    sm.move(1, 0, false);
    expect(sm.focus).toEqual({ row: 10, col: 9 });
  });

  it('getInfo returns correct data', () => {
    const sm = new SelectionModel(10, 10);
    sm.focusCell(2, 3);
    sm.extendTo(5, 6);
    const info = sm.getInfo();
    expect(info.focus).toEqual({ row: 2, col: 3 });
    expect(info.bounds).toEqual({ startRow: 2, startCol: 3, endRow: 5, endCol: 6 });
    expect(info.isMultiCell).toBe(true);
    expect(info.cellCount).toBe(16); // 4 rows x 4 cols
    expect(info.rowSpan).toBe(4);
    expect(info.colSpan).toBe(4);
  });

  it('column selection isFullCol after expand', () => {
    const sm = new SelectionModel(10, 10);
    sm.selectColumn(3);
    const info = sm.getInfo();
    expect(info.isFullCol).toBe(true);
    // Expand rows - column should still be "full"
    sm.setDimensions(20, 10);
    expect(sm.isSelected(15, 3)).toBe(true); // Infinity covers new rows
  });
});
