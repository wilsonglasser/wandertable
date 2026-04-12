import { describe, it, expect } from 'vitest';
import { DataModel } from '../core/DataModel.js';

describe('DataModel', () => {
  it('should set and get cells', () => {
    const dm = new DataModel(10, 10);
    dm.setCellValue(0, 0, 'hello');
    expect(dm.getCell(0, 0)?.value).toBe('hello');
  });

  it('should return undefined for empty cells', () => {
    const dm = new DataModel(10, 10);
    expect(dm.getCell(5, 5)).toBeUndefined();
  });

  it('should delete cells', () => {
    const dm = new DataModel(10, 10);
    dm.setCellValue(0, 0, 'hello');
    dm.deleteCell(0, 0);
    expect(dm.getCell(0, 0)).toBeUndefined();
  });

  it('should apply patches', () => {
    const dm = new DataModel(10, 10);
    dm.applyPatch([
      { row: 0, col: 0, data: { value: 'a' } },
      { row: 1, col: 1, data: { value: 'b' } },
      { row: 2, col: 2, data: { value: 'c' } },
    ]);
    expect(dm.getCell(0, 0)?.value).toBe('a');
    expect(dm.getCell(1, 1)?.value).toBe('b');
    expect(dm.getCell(2, 2)?.value).toBe('c');
  });

  it('should batch changes in transaction', () => {
    const dm = new DataModel(10, 10);
    let callCount = 0;
    dm.onChange = () => { callCount++; };

    dm.transaction(() => {
      dm.setCellValue(0, 0, 'a');
      dm.setCellValue(1, 1, 'b');
      dm.setCellValue(2, 2, 'c');
    });

    expect(callCount).toBe(1); // single notification
    expect(dm.getCell(0, 0)?.value).toBe('a');
  });

  it('should track hasCell correctly', () => {
    const dm = new DataModel(10, 10);
    expect(dm.hasCell(0, 0)).toBe(false);
    dm.setCellValue(0, 0, 'x');
    expect(dm.hasCell(0, 0)).toBe(true);
    dm.deleteCell(0, 0);
    expect(dm.hasCell(0, 0)).toBe(false);
  });

  it('should clear all data', () => {
    const dm = new DataModel(10, 10);
    dm.setCellValue(0, 0, 'a');
    dm.setCellValue(5, 5, 'b');
    dm.clear();
    expect(dm.getCell(0, 0)).toBeUndefined();
    expect(dm.getCell(5, 5)).toBeUndefined();
  });
});
