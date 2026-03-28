const BOX = {
  topLeft: '\u250c',
  topRight: '\u2510',
  bottomLeft: '\u2514',
  bottomRight: '\u2518',
  horizontal: '\u2500',
  vertical: '\u2502',
  leftT: '\u251c',
  rightT: '\u2524',
  topT: '\u252c',
  bottomT: '\u2534',
  cross: '\u253c',
};

export function boxTop(width: number): string {
  return BOX.topLeft + BOX.horizontal.repeat(width - 2) + BOX.topRight;
}

export function boxBottom(width: number): string {
  return BOX.bottomLeft + BOX.horizontal.repeat(width - 2) + BOX.bottomRight;
}

export function boxDivider(width: number): string {
  return BOX.leftT + BOX.horizontal.repeat(width - 2) + BOX.rightT;
}

export function boxRow(content: string, width: number): string {
  const inner = width - 4; // 2 borders + 2 spaces
  const truncated = content.length > inner ? content.slice(0, inner - 1) + '\u2026' : content;
  const padded = truncated.padEnd(inner);
  return `${BOX.vertical} ${padded} ${BOX.vertical}`;
}

interface TableOptions {
  minColWidth?: number;
  totalWidth?: number;
}

function buildTableDivider(colWidths: number[], top: boolean, bottom: boolean): string {
  const left = top ? BOX.topLeft : bottom ? BOX.bottomLeft : BOX.leftT;
  const right = top ? BOX.topRight : bottom ? BOX.bottomRight : BOX.rightT;
  const cross = top ? BOX.topT : bottom ? BOX.bottomT : BOX.cross;
  return left + colWidths.map((w) => BOX.horizontal.repeat(w + 2)).join(cross) + right;
}

function buildTableRow(cells: string[], colWidths: number[]): string {
  const parts = cells.map((cell, i) => {
    const w = colWidths[i] ?? 0;
    const truncated = cell.length > w ? cell.slice(0, w - 1) + '\u2026' : cell;
    return ' ' + truncated.padEnd(w) + ' ';
  });
  return BOX.vertical + parts.join(BOX.vertical) + BOX.vertical;
}

export function formatTable(
  headers: string[],
  rows: string[][],
  options: TableOptions = {}
): string {
  const minW = options.minColWidth ?? 4;

  // Calculate column widths
  const colWidths = headers.map((h, i) => {
    const maxDataLen = rows.reduce((max, row) => {
      const cell = row[i] ?? '';
      return Math.max(max, cell.length);
    }, 0);
    return Math.max(minW, h.length, maxDataLen);
  });

  const lines: string[] = [];
  lines.push(buildTableDivider(colWidths, true, false));
  lines.push(buildTableRow(headers, colWidths));
  lines.push(buildTableDivider(colWidths, false, false));
  for (const row of rows) {
    lines.push(buildTableRow(row, colWidths));
  }
  lines.push(buildTableDivider(colWidths, false, true));

  return lines.join('\n');
}

export function formatStatusSymbol(status: 'active' | 'idle' | 'unknown'): string {
  switch (status) {
    case 'active': return '\u25cf active';
    case 'idle':   return '\u25cb idle';
    default:       return '? unknown';
  }
}
