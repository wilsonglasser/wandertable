export interface RowGroup {
  /** First data row of the group */
  startRow: number;
  /** Number of child rows (excluding the header row) */
  count: number;
  /** Label shown on the group header */
  label?: string;
  /** Is the group currently expanded? */
  expanded: boolean;
  /** Nesting depth (0 = top level) */
  depth: number;
}

/**
 * Manages row grouping with expand/collapse.
 * Groups hide/show rows by integrating with ViewMapping filters.
 */
export class RowGroupModel {
  private groups: RowGroup[] = [];
  private hiddenRows = new Set<number>();

  onChange: (() => void) | null = null;

  constructor(initialGroups?: RowGroup[]) {
    if (initialGroups) {
      this.groups = initialGroups.map(g => ({ ...g }));
      this.rebuildHidden();
    }
  }

  addGroup(group: RowGroup): void {
    this.groups.push({ ...group });
    this.rebuildHidden();
    this.onChange?.();
  }

  removeGroup(startRow: number): void {
    this.groups = this.groups.filter(g => g.startRow !== startRow);
    this.rebuildHidden();
    this.onChange?.();
  }

  toggleGroup(startRow: number): void {
    const group = this.groups.find(g => g.startRow === startRow);
    if (!group) return;
    group.expanded = !group.expanded;
    this.rebuildHidden();
    this.onChange?.();
  }

  expandAll(): void {
    for (const g of this.groups) g.expanded = true;
    this.rebuildHidden();
    this.onChange?.();
  }

  collapseAll(): void {
    for (const g of this.groups) g.expanded = false;
    this.rebuildHidden();
    this.onChange?.();
  }

  isGroupHeader(row: number): RowGroup | null {
    return this.groups.find(g => g.startRow === row) ?? null;
  }

  isHidden(row: number): boolean {
    return this.hiddenRows.has(row);
  }

  getGroups(): RowGroup[] {
    return [...this.groups];
  }

  /** Build the set of hidden rows based on collapsed groups */
  private rebuildHidden(): void {
    this.hiddenRows.clear();
    for (const g of this.groups) {
      if (!g.expanded) {
        // Hide all child rows (startRow+1 to startRow+count)
        for (let i = 1; i <= g.count; i++) {
          this.hiddenRows.add(g.startRow + i);
        }
      }
    }
  }

  /** Get a filter function compatible with ViewMapping */
  getFilter(): (row: number) => boolean {
    return (row: number) => !this.hiddenRows.has(row);
  }

  clear(): void {
    this.groups = [];
    this.hiddenRows.clear();
    this.onChange?.();
  }
}
