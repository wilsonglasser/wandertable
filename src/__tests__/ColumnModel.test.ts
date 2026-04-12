import { describe, it, expect } from 'vitest';
import { ColumnModel, columnLabel } from '../columns/ColumnModel.js';

describe('ColumnModel', () => {
  it('should create with default widths', () => {
    const cm = new ColumnModel(5, 100);
    expect(cm.count).toBe(5);
    expect(cm.getWidth(0)).toBe(100);
    expect(cm.getWidth(4)).toBe(100);
  });

  it('should set width with min/max clamp', () => {
    const cm = new ColumnModel(5, 100, [
      { minWidth: 50, maxWidth: 200 },
    ]);
    cm.setWidth(0, 300);
    expect(cm.getWidth(0)).toBe(200);
    cm.setWidth(0, 10);
    expect(cm.getWidth(0)).toBe(50);
  });

  it('should calculate total width', () => {
    const cm = new ColumnModel(3, 100);
    expect(cm.getTotalWidth()).toBe(300);
    cm.setWidth(1, 200);
    expect(cm.getTotalWidth()).toBe(400);
  });

  it('should find column at X via binary search', () => {
    const cm = new ColumnModel(5, 100);
    expect(cm.getColAtX(0)).toBe(0);
    expect(cm.getColAtX(99)).toBe(0);
    expect(cm.getColAtX(100)).toBe(1);
    expect(cm.getColAtX(250)).toBe(2);
  });

  it('should return correct prefix sum positions', () => {
    const cm = new ColumnModel(3, 100);
    expect(cm.getX(0)).toBe(0);
    expect(cm.getX(1)).toBe(100);
    expect(cm.getX(2)).toBe(200);
  });
});

describe('columnLabel', () => {
  it('should convert indices to letters', () => {
    expect(columnLabel(0)).toBe('A');
    expect(columnLabel(1)).toBe('B');
    expect(columnLabel(25)).toBe('Z');
    expect(columnLabel(26)).toBe('AA');
    expect(columnLabel(27)).toBe('AB');
    expect(columnLabel(51)).toBe('AZ');
    expect(columnLabel(52)).toBe('BA');
    expect(columnLabel(701)).toBe('ZZ');
    expect(columnLabel(702)).toBe('AAA');
  });
});
