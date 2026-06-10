import { describe, it, expect } from 'vitest';
import { ViewMapping } from '../core/ViewMapping.js';
import { DataModel } from '../core/DataModel.js';

describe('ViewMapping', () => {
  it('should be identity by default', () => {
    const dm = new DataModel(10, 5);
    const vm = new ViewMapping(dm);
    expect(vm.visibleRowCount).toBe(10);
    expect(vm.toDataRow(3)).toBe(3);
    expect(vm.toVisualRow(3)).toBe(3);
  });

  it('should sort ascending', () => {
    const dm = new DataModel(5, 2);
    dm.setCellValue(0, 0, 'C');
    dm.setCellValue(1, 0, 'A');
    dm.setCellValue(2, 0, 'B');

    const vm = new ViewMapping(dm);
    vm.sort(0, 'asc');

    // Visual row 0 should be data row 1 (A)
    expect(vm.toDataRow(0)).toBe(1);
    // Visual row 1 should be data row 2 (B)
    expect(vm.toDataRow(1)).toBe(2);
    // Visual row 2 should be data row 0 (C)
    expect(vm.toDataRow(2)).toBe(0);
  });

  it('should sort descending', () => {
    const dm = new DataModel(3, 1);
    dm.setCellValue(0, 0, 1);
    dm.setCellValue(1, 0, 3);
    dm.setCellValue(2, 0, 2);

    const vm = new ViewMapping(dm);
    vm.sort(0, 'desc');

    expect(vm.toDataRow(0)).toBe(1); // 3
    expect(vm.toDataRow(1)).toBe(2); // 2
    expect(vm.toDataRow(2)).toBe(0); // 1
  });

  it('should filter rows', () => {
    const dm = new DataModel(5, 1);
    dm.setCellValue(0, 0, 'yes');
    dm.setCellValue(1, 0, 'no');
    dm.setCellValue(2, 0, 'yes');
    dm.setCellValue(3, 0, 'no');
    dm.setCellValue(4, 0, 'yes');

    const vm = new ViewMapping(dm);
    vm.setFilter(0, (row, data) => data.getCell(row, 0)?.value === 'yes');

    expect(vm.visibleRowCount).toBe(3);
    expect(vm.toDataRow(0)).toBe(0);
    expect(vm.toDataRow(1)).toBe(2);
    expect(vm.toDataRow(2)).toBe(4);
  });

  it('should clear sort', () => {
    const dm = new DataModel(3, 1);
    dm.setCellValue(0, 0, 'C');
    dm.setCellValue(1, 0, 'A');

    const vm = new ViewMapping(dm);
    vm.sort(0, 'asc');
    expect(vm.toDataRow(0)).toBe(1);
    // Sort state drives the header sort indicator arrow.
    expect(vm.getSortState()).toEqual({ col: 0, direction: 'asc', compareFn: undefined });

    vm.clearSort();
    expect(vm.toDataRow(0)).toBe(0);
    expect(vm.getSortState()).toBeNull();
  });

  it('should combine sort and filter', () => {
    const dm = new DataModel(5, 2);
    dm.setCellValue(0, 0, 3); dm.setCellValue(0, 1, 'show');
    dm.setCellValue(1, 0, 1); dm.setCellValue(1, 1, 'hide');
    dm.setCellValue(2, 0, 5); dm.setCellValue(2, 1, 'show');
    dm.setCellValue(3, 0, 2); dm.setCellValue(3, 1, 'show');
    dm.setCellValue(4, 0, 4); dm.setCellValue(4, 1, 'hide');

    const vm = new ViewMapping(dm);
    vm.setFilter(1, (row, data) => data.getCell(row, 1)?.value === 'show');
    vm.sort(0, 'asc');

    expect(vm.visibleRowCount).toBe(3);
    expect(vm.toDataRow(0)).toBe(3); // value=2
    expect(vm.toDataRow(1)).toBe(0); // value=3
    expect(vm.toDataRow(2)).toBe(2); // value=5
  });
});
