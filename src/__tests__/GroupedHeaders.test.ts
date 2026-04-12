import { describe, it, expect } from 'vitest';
import { flattenColumns } from '../columns/GroupedHeaders.js';

describe('flattenColumns', () => {
  it('should flatten simple columns', () => {
    const result = flattenColumns([
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
    ]);
    expect(result.flatColumns).toHaveLength(2);
    expect(result.maxDepth).toBe(1);
    expect(result.headerRows).toHaveLength(1);
  });

  it('should flatten grouped columns', () => {
    const result = flattenColumns([
      { key: 'name', label: 'Name' },
      {
        label: 'Sales',
        children: [
          { key: 'q1', label: 'Q1' },
          { key: 'q2', label: 'Q2' },
          { key: 'q3', label: 'Q3' },
        ],
      },
    ]);

    expect(result.flatColumns).toHaveLength(4); // name, q1, q2, q3
    expect(result.maxDepth).toBe(2);
    expect(result.headerRows).toHaveLength(2);

    // Top level: Name (rowSpan 2) + Sales (colSpan 3)
    expect(result.headerRows[0]).toHaveLength(2);
    expect(result.headerRows[0][0].label).toBe('Name');
    expect(result.headerRows[0][0].rowSpan).toBe(2);
    expect(result.headerRows[0][1].label).toBe('Sales');
    expect(result.headerRows[0][1].colSpan).toBe(3);

    // Second level: Q1, Q2, Q3
    expect(result.headerRows[1]).toHaveLength(3);
    expect(result.headerRows[1][0].label).toBe('Q1');
  });

  it('should handle deeply nested groups', () => {
    const result = flattenColumns([
      {
        label: 'Level 1',
        children: [{
          label: 'Level 2',
          children: [
            { key: 'deep', label: 'Deep' },
          ],
        }],
      },
    ]);

    expect(result.maxDepth).toBe(3);
    expect(result.flatColumns).toHaveLength(1);
    expect(result.flatColumns[0].key).toBe('deep');
  });
});
