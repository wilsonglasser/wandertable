export interface CommandChange {
  row: number;
  col: number;
  oldValue: unknown;
  newValue: unknown;
}

export interface Command {
  execute(): void;
  undo(): void;
  /** Return a description of what this command changes, for external sync */
  getChanges(): CommandChange[];
}

export class CommandBus {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private limit: number;

  onChange: (() => void) | null = null;

  constructor(limit = 100) {
    this.limit = limit;
  }

  execute(cmd: Command): void {
    cmd.execute();
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    // Executing a new command clears redo history
    this.redoStack.length = 0;
    this.onChange?.();
  }

  undo(): Command | null {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;
    cmd.undo();
    this.redoStack.push(cmd);
    this.onChange?.();
    return cmd;
  }

  redo(): Command | null {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;
    cmd.execute();
    this.undoStack.push(cmd);
    this.onChange?.();
    return cmd;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}

// ── Concrete commands ──

import type { CellData, CellPatch } from '../types/index.js';
import type { DataModel } from './DataModel.js';

/** Set a single cell value */
export class SetCellValueCommand implements Command {
  private oldValue: unknown;
  constructor(
    private data: DataModel,
    private row: number,
    private col: number,
    private newValue: unknown,
  ) {
    this.oldValue = data.getCell(row, col)?.value;
  }

  execute(): void {
    this.data.setCellValue(this.row, this.col, this.newValue);
  }

  undo(): void {
    if (this.oldValue === undefined) {
      this.data.deleteCell(this.row, this.col);
    } else {
      this.data.setCellValue(this.row, this.col, this.oldValue);
    }
  }

  getChanges(): CommandChange[] {
    return [{ row: this.row, col: this.col, oldValue: this.oldValue, newValue: this.newValue }];
  }
}

/** Apply a batch of patches (stores snapshots of old cell data) */
export class PatchCommand implements Command {
  private snapshots: { row: number; col: number; old: CellData | undefined }[];

  constructor(
    private data: DataModel,
    private patches: CellPatch[],
  ) {
    this.snapshots = patches.map(p => ({
      row: p.row,
      col: p.col,
      old: data.getCell(p.row, p.col) ? { ...data.getCell(p.row, p.col)! } : undefined,
    }));
  }

  execute(): void {
    this.data.applyPatch(this.patches);
  }

  undo(): void {
    this.data.transaction(() => {
      for (const snap of this.snapshots) {
        if (snap.old === undefined) {
          this.data.deleteCell(snap.row, snap.col);
        } else {
          this.data.setCell(snap.row, snap.col, snap.old);
        }
      }
    });
  }

  getChanges(): CommandChange[] {
    return this.snapshots.map((snap, i) => ({
      row: snap.row,
      col: snap.col,
      oldValue: snap.old?.value,
      newValue: this.patches[i]?.data?.value,
    }));
  }
}

/** Delete selected cells (stores snapshots) */
export class DeleteCellsCommand implements Command {
  private snapshots: { row: number; col: number; old: CellData }[] = [];

  constructor(
    private data: DataModel,
    private cells: { row: number; col: number }[],
  ) {
    for (const { row, col } of cells) {
      const old = data.getCell(row, col);
      if (old) {
        this.snapshots.push({ row, col, old: { ...old } });
      }
    }
  }

  execute(): void {
    this.data.transaction(() => {
      for (const { row, col } of this.cells) {
        this.data.deleteCell(row, col);
      }
    });
  }

  undo(): void {
    this.data.transaction(() => {
      for (const snap of this.snapshots) {
        this.data.setCell(snap.row, snap.col, snap.old);
      }
    });
  }

  getChanges(): CommandChange[] {
    return this.snapshots.map(snap => ({
      row: snap.row,
      col: snap.col,
      oldValue: snap.old.value,
      newValue: undefined,
    }));
  }
}
