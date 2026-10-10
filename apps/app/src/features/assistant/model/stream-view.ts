const FENCE = /^```/gm;

const TABLE_ROW = /^\s*\|/;

type PendingBlock = 'code' | 'table' | null;

export interface StreamView {
  readonly settled: string;
  readonly tail: string;
  readonly pending: PendingBlock;
}

function splitSettled(text: string): readonly [string, string] {
  const fences = text.match(FENCE)?.length ?? 0;
  const open = fences % 2 === 1 ? text.lastIndexOf('```') : -1;
  const searchEnd = open === -1 ? text.length : open;
  const cut = text.lastIndexOf('\n\n', searchEnd);
  return cut <= 0 ? ['', text] : [text.slice(0, cut), text.slice(cut + 2)];
}

function withoutOpenFence(text: string): { readonly text: string; readonly open: boolean } {
  const fences = text.match(FENCE)?.length ?? 0;
  return fences % 2 === 1
    ? { text: text.slice(0, text.lastIndexOf('```')).trimEnd(), open: true }
    : { text, open: false };
}

function withoutOpenTable(text: string): { readonly text: string; readonly open: boolean } {
  const lines = text.split('\n');
  let end = lines.length;
  while (end > 0 && TABLE_ROW.test(lines[end - 1] ?? '')) {
    end -= 1;
  }
  const trailing = end < lines.length;
  return trailing
    ? { text: lines.slice(0, end).join('\n').trimEnd(), open: true }
    : { text, open: false };
}

export function streamView(text: string): StreamView {
  const code = withoutOpenFence(text);
  const table = code.open ? { text: code.text, open: false } : withoutOpenTable(code.text);
  const [settled, tail] = splitSettled(table.text);
  const pending: PendingBlock = code.open ? 'code' : table.open ? 'table' : null;
  return { settled, tail, pending };
}
