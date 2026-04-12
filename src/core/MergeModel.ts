export interface MergeRange {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

/**
 * Tracks merged cell ranges.
 * A merge means one "anchor" cell (top-left) spans multiple rows/columns.
 * The other cells in the range are "hidden" (not rendered individually).
 */
export class MergeModel {
  /** All active merges */
  private merges: MergeRange[] = [];
  /** Quick lookup: "row:col" -> merge that covers this cell */
  private coverMap = new Map<string, MergeRange>();

  onChange: (() => void) | null = null;

  constructor(initialMerges?: MergeRange[]) {
    if (initialMerges) {
      for (const m of initialMerges) {
        this.addMerge(m, false);
      }
    }
  }

  private key(row: number, col: number): string {
    return `${row}:${col}`;
  }

  /** Add a merge. The anchor is (row, col). */
  addMerge(merge: MergeRange, notify = true): void {
    // Validate
    if (merge.rowSpan < 1 || merge.colSpan < 1) return;
    if (merge.rowSpan === 1 && merge.colSpan === 1) return; // not a merge

    // Check for overlap with existing merges
    for (let r = merge.row; r < merge.row + merge.rowSpan; r++) {
      for (let c = merge.col; c < merge.col + merge.colSpan; c++) {
        if (this.coverMap.has(this.key(r, c))) {
          // Cell already covered by another merge - remove that merge first
          const existing = this.coverMap.get(this.key(r, c))!;
          this.removeMerge(existing.row, existing.col, false);
        }
      }
    }

    this.merges.push(merge);

    // Fill the cover map
    for (let r = merge.row; r < merge.row + merge.rowSpan; r++) {
      for (let c = merge.col; c < merge.col + merge.colSpan; c++) {
        this.coverMap.set(this.key(r, c), merge);
      }
    }

    if (notify) this.onChange?.();
  }

  /** Remove the merge anchored at (row, col) */
  removeMerge(row: number, col: number, notify = true): boolean {
    const idx = this.merges.findIndex(m => m.row === row && m.col === col);
    if (idx === -1) return false;

    const merge = this.merges[idx];
    this.merges.splice(idx, 1);

    // Clear cover map
    for (let r = merge.row; r < merge.row + merge.rowSpan; r++) {
      for (let c = merge.col; c < merge.col + merge.colSpan; c++) {
        this.coverMap.delete(this.key(r, c));
      }
    }

    if (notify) this.onChange?.();
    return true;
  }

  /** Get the merge that covers (row, col), or null */
  getMerge(row: number, col: number): MergeRange | null {
    return this.coverMap.get(this.key(row, col)) ?? null;
  }

  /** Is this cell the anchor (top-left) of a merge? */
  isAnchor(row: number, col: number): boolean {
    const m = this.coverMap.get(this.key(row, col));
    return m !== undefined && m.row === row && m.col === col;
  }

  /** Is this cell hidden by a merge (i.e. not the anchor)? */
  isHidden(row: number, col: number): boolean {
    const m = this.coverMap.get(this.key(row, col));
    return m !== undefined && (m.row !== row || m.col !== col);
  }

  /** Get all merges */
  getAll(): MergeRange[] {
    return [...this.merges];
  }

  /** Clear all merges */
  clear(): void {
    this.merges.length = 0;
    this.coverMap.clear();
    this.onChange?.();
  }
}
