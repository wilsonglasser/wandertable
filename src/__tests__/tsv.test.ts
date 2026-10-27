import { describe, expect, it } from 'vitest';
import { parseTSV, serializeTSV } from '../interaction/tsv.js';

describe('TSV clipboard format', () => {
  it('reads Excel CRLF text without a phantom row or stray \\r', () => {
    expect(parseTSV('a\tb\r\nc\td\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('keeps quoted cells with tabs, newlines and doubled quotes intact', () => {
    expect(parseTSV('"line 1\nline 2"\t"say ""hi"""\tplain\r\n')).toEqual([
      ['line 1\nline 2', 'say "hi"', 'plain'],
    ]);
  });

  it('keeps empty cells and a lone value', () => {
    expect(parseTSV('a\t\tc')).toEqual([['a', '', 'c']]);
    expect(parseTSV('42')).toEqual([['42']]);
    expect(parseTSV('')).toEqual([]);
  });

  it('round-trips through serializeTSV', () => {
    const rows = [['a\tb', 'x'], ['multi\nline', 'q"uote']];
    expect(parseTSV(serializeTSV(rows))).toEqual(rows);
  });
});
