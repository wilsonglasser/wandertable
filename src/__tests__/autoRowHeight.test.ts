import { describe, it, expect } from 'vitest';
import { computeAutoRowHeight } from '../render/autoRowHeight.js';

describe('computeAutoRowHeight', () => {
  it('returns the minimum when there are no cells', () => {
    expect(computeAutoRowHeight([], 20)).toBe(20);
  });

  it('returns the minimum when every cell is shorter than it', () => {
    expect(computeAutoRowHeight([10, 14, 18], 20)).toBe(20);
  });

  it('grows to the tallest cell — a single wrapped cell wins', () => {
    // e.g. a supplier name wrapping to 2 lines (48px) among short sibling cells
    expect(computeAutoRowHeight([20, 48, 20, 20], 20)).toBe(48);
  });

  it('considers cells from both pools (main + frozen) passed in together', () => {
    // frozen Supplier cell is the tallest; answer cells are short
    expect(computeAutoRowHeight([20, 20, 64], 20)).toBe(64);
  });

  it('uses the largest of several tall cells', () => {
    expect(computeAutoRowHeight([40, 72, 56], 20)).toBe(72);
  });
});
