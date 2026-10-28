import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

const rule = (selector: string): string => {
  const match = css.match(new RegExp(selector.replace('.', '\\.') + '\\s*\\{([^}]*)\\}'));
  return match ? match[1] : '';
};

describe('styles', () => {
  it('keeps the grid out of browser scroll anchoring (recycled rows made the page run away)', () => {
    expect(rule('.wt-root')).toMatch(/overflow-anchor:\s*none/);
  });
});
