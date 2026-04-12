import { describe, it, expect } from 'vitest';
import { CommandBus, SetCellValueCommand, PatchCommand, DeleteCellsCommand } from '../core/CommandBus.js';
import { DataModel } from '../core/DataModel.js';

describe('CommandBus', () => {
  it('should execute and undo', () => {
    const dm = new DataModel(10, 10);
    const bus = new CommandBus();

    const cmd = new SetCellValueCommand(dm, 0, 0, 'hello');
    bus.execute(cmd);
    expect(dm.getCell(0, 0)?.value).toBe('hello');

    bus.undo();
    expect(dm.getCell(0, 0)).toBeUndefined();
  });

  it('should redo after undo', () => {
    const dm = new DataModel(10, 10);
    const bus = new CommandBus();

    const cmd = new SetCellValueCommand(dm, 0, 0, 'hello');
    bus.execute(cmd);
    bus.undo();
    bus.redo();
    expect(dm.getCell(0, 0)?.value).toBe('hello');
  });

  it('should clear redo stack on new execute', () => {
    const dm = new DataModel(10, 10);
    const bus = new CommandBus();

    bus.execute(new SetCellValueCommand(dm, 0, 0, 'a'));
    bus.undo();
    expect(bus.canRedo).toBe(true);

    bus.execute(new SetCellValueCommand(dm, 0, 0, 'b'));
    expect(bus.canRedo).toBe(false);
  });

  it('should respect undo limit', () => {
    const dm = new DataModel(10, 10);
    const bus = new CommandBus(3);

    bus.execute(new SetCellValueCommand(dm, 0, 0, 'a'));
    bus.execute(new SetCellValueCommand(dm, 0, 0, 'b'));
    bus.execute(new SetCellValueCommand(dm, 0, 0, 'c'));
    bus.execute(new SetCellValueCommand(dm, 0, 0, 'd'));

    // Only 3 undos should be possible
    expect(bus.undo()).not.toBeNull();
    expect(bus.undo()).not.toBeNull();
    expect(bus.undo()).not.toBeNull();
    expect(bus.undo()).toBeNull();
  });

  it('PatchCommand should undo batch', () => {
    const dm = new DataModel(10, 10);
    const bus = new CommandBus();

    const cmd = new PatchCommand(dm, [
      { row: 0, col: 0, data: { value: 'a' } },
      { row: 1, col: 1, data: { value: 'b' } },
    ]);
    bus.execute(cmd);
    expect(dm.getCell(0, 0)?.value).toBe('a');
    expect(dm.getCell(1, 1)?.value).toBe('b');

    bus.undo();
    expect(dm.getCell(0, 0)).toBeUndefined();
    expect(dm.getCell(1, 1)).toBeUndefined();
  });

  it('DeleteCellsCommand should restore on undo', () => {
    const dm = new DataModel(10, 10);
    const bus = new CommandBus();

    dm.setCellValue(0, 0, 'keep me');
    dm.setCellValue(1, 1, 'me too');

    const cmd = new DeleteCellsCommand(dm, [
      { row: 0, col: 0 },
      { row: 1, col: 1 },
    ]);
    bus.execute(cmd);
    expect(dm.getCell(0, 0)).toBeUndefined();

    bus.undo();
    expect(dm.getCell(0, 0)?.value).toBe('keep me');
    expect(dm.getCell(1, 1)?.value).toBe('me too');
  });

  it('getChanges returns correct data', () => {
    const dm = new DataModel(10, 10);
    dm.setCellValue(0, 0, 'old');

    const cmd = new SetCellValueCommand(dm, 0, 0, 'new');
    const changes = cmd.getChanges();
    expect(changes).toEqual([{ row: 0, col: 0, oldValue: 'old', newValue: 'new' }]);
  });
});
