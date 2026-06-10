/**
 * Compute the height an auto-sized row should take: the tallest measured cell
 * content height across both the main (scrolling) and frozen pools, floored at a
 * minimum. Measurement of `cellHeights` is done elsewhere (the DOM layer reads
 * each cell's natural `scrollHeight` while top-aligned); this is the pure
 * reduction so it can be unit-tested without a DOM.
 *
 * @param cellHeights measured content heights of the row's visible cells
 * @param minHeight   lower bound (never collapse below this)
 */
export function computeAutoRowHeight(cellHeights: number[], minHeight: number): number {
  let maxH = minHeight;
  for (const h of cellHeights) {
    if (h > maxH) {
      maxH = h;
    }
  }
  return maxH;
}
