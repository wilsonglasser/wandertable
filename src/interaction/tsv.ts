/**
 * Tab-separated clipboard text as spreadsheets write it: CRLF or LF rows, and
 * a cell holding a tab, newline or quote is wrapped in quotes with inner
 * quotes doubled. One trailing newline (Excel always adds it) is not a row.
 */
export function parseTSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  const n = text.length;
  let atCellStart = true;

  while (i < n) {
    const ch = text[i];
    if (atCellStart && ch === '"') {
      // Quoted cell: read up to the closing quote, "" is a literal quote.
      let j = i + 1;
      let value = '';
      let closed = false;
      while (j < n) {
        if (text[j] === '"') {
          if (text[j + 1] === '"') {
            value += '"';
            j += 2;
            continue;
          }
          closed = true;
          j++;
          break;
        }
        value += text[j];
        j++;
      }
      const next = text[j];
      if (closed && (j >= n || next === '\t' || next === '\n' || next === '\r')) {
        cell = value;
        i = j;
        atCellStart = false;
        continue;
      }
      // Not a well-formed quoted cell: treat the quote as plain text.
    }
    if (ch === '\t') {
      row.push(cell);
      cell = '';
      atCellStart = true;
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      atCellStart = true;
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    cell += ch;
    atCellStart = false;
    i++;
  }

  if (!atCellStart || cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function quoteCell(value: string): string {
  return /[\t\n\r"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function serializeTSV(rows: string[][]): string {
  return rows.map((r) => r.map(quoteCell).join('\t')).join('\r\n');
}
