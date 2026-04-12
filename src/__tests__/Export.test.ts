import { describe, it, expect } from 'vitest';
import { exportCSV, exportJSON } from '../plugins/Export.js';
import { DataModel } from '../core/DataModel.js';
import { ViewMapping } from '../core/ViewMapping.js';

describe('Export', () => {
  function setup() {
    const dm = new DataModel(3, 3);
    dm.setCellValue(0, 0, 'Name');
    dm.setCellValue(0, 1, 'Age');
    dm.setCellValue(0, 2, 'City');
    dm.setCellValue(1, 0, 'Alice');
    dm.setCellValue(1, 1, 30);
    dm.setCellValue(1, 2, 'NYC');
    dm.setCellValue(2, 0, 'Bob');
    dm.setCellValue(2, 1, 25);
    dm.setCellValue(2, 2, 'LA');
    const vm = new ViewMapping(dm);
    return { dm, vm };
  }

  it('should export CSV', () => {
    const { dm, vm } = setup();
    const csv = exportCSV(dm, vm, { includeHeaders: false });
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Name,Age,City');
    expect(lines[1]).toBe('Alice,30,NYC');
  });

  it('should export CSV with custom headers', () => {
    const { dm, vm } = setup();
    const csv = exportCSV(dm, vm, {
      columns: [0, 1],
      headers: ['Name', 'Age'],
      includeHeaders: true,
    });
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Name,Age');
    expect(lines[1]).toBe('Name,Age'); // data row 0
  });

  it('should export JSON', () => {
    const { dm, vm } = setup();
    const json = exportJSON(dm, vm, {
      columns: [0, 1, 2],
      headers: ['name', 'age', 'city'],
    });
    expect(json).toHaveLength(3);
    expect(json[1]).toEqual({ name: 'Alice', age: 30, city: 'NYC' });
  });

  it('should escape CSV values with commas', () => {
    const dm = new DataModel(1, 1);
    dm.setCellValue(0, 0, 'hello, world');
    const vm = new ViewMapping(dm);
    const csv = exportCSV(dm, vm, { includeHeaders: false });
    expect(csv).toBe('"hello, world"');
  });
});
