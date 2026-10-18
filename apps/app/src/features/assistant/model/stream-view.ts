const FENCE = /^```/gm;

const TABLE_ROW = /^\s*\|/;

type PendingBlock = 'code' | 'table' | null;

export interface StreamView {
  readonly settled: readonly string[];
  readonly tail: string;
  readonly pending: PendingBlock;
}

interface Split {
  readonly settled: string;
  readonly tail: string;
  readonly consumed: number;
}

function splitSettled(text: string): Split {
  let fenced = false;
  let offset = 0;
  let cut = -1;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) {
      fenced = !fenced;
    }
    if (!fenced && line === '' && offset > 0) {
      cut = offset - 1;
    }
    offset += line.length + 1;
  }
  return cut <= 0
    ? { settled: '', tail: text, consumed: 0 }
    : { settled: text.slice(0, cut), tail: text.slice(cut + 2), consumed: cut + 2 };
}

function blocksOf(text: string): readonly string[] {
  if (text === '') return [];
  const blocks: string[] = [];
  let lines: string[] = [];
  let fenced = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) fenced = !fenced;
    if (!fenced && line === '') {
      if (lines.length > 0) blocks.push(lines.join('\n'));
      lines = [];
    } else {
      lines.push(line);
    }
  }
  if (lines.length > 0) blocks.push(lines.join('\n'));
  return blocks;
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

function viewOf(text: string): StreamView & { readonly consumed: number } {
  const code = withoutOpenFence(text);
  const table = code.open ? { text: code.text, open: false } : withoutOpenTable(code.text);
  const { settled, tail, consumed } = splitSettled(table.text);
  const pending: PendingBlock = code.open ? 'code' : table.open ? 'table' : null;
  return { settled: blocksOf(settled), tail, pending, consumed };
}

export function streamView(text: string): StreamView {
  const { consumed: _consumed, ...view } = viewOf(text);
  return view;
}

export class StreamParser {
  private head = '';
  private offset = 0;
  private done: readonly string[] = [];

  view(text: string): StreamView {
    if (!text.startsWith(this.head)) {
      this.head = '';
      this.offset = 0;
      this.done = [];
    }
    const rest = text.slice(this.offset);
    const { settled, tail, pending, consumed } = viewOf(rest);
    if (settled.length === 0) return { settled: this.done, tail, pending };
    const all = [...this.done, ...settled];
    if (consumed <= rest.length) {
      this.done = all;
      this.offset += consumed;
      this.head = text.slice(0, this.offset);
    }
    return { settled: all, tail, pending };
  }
}

export function finalView(text: string): StreamView {
  const { settled, tail } = splitSettled(text);
  return { settled: blocksOf(settled), tail, pending: null };
}
