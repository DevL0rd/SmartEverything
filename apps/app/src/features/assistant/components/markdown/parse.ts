export type Inline =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'strong'; readonly text: string }
  | { readonly kind: 'em'; readonly text: string }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'link'; readonly text: string; readonly url: string };

export type Block =
  | { readonly kind: 'paragraph'; readonly inline: readonly Inline[] }
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3; readonly inline: readonly Inline[] }
  | { readonly kind: 'quote'; readonly inline: readonly Inline[] }
  | {
      readonly kind: 'list';
      readonly ordered: boolean;
      readonly items: readonly (readonly Inline[])[];
    }
  | { readonly kind: 'code'; readonly language: string; readonly code: string }
  | {
      readonly kind: 'table';
      readonly header: readonly (readonly Inline[])[];
      readonly rows: readonly (readonly (readonly Inline[])[])[];
    };

const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

function tokenOf(match: string): Inline {
  if (match.startsWith('`')) {
    return { kind: 'code', text: match.slice(1, -1) };
  }
  if (match.startsWith('**')) {
    return { kind: 'strong', text: match.slice(2, -2) };
  }
  if (match.startsWith('[')) {
    const split = match.indexOf('](');
    return { kind: 'link', text: match.slice(1, split), url: match.slice(split + 2, -1) };
  }
  if (match.startsWith('http')) {
    return { kind: 'link', text: match, url: match };
  }
  return { kind: 'em', text: match.slice(1, -1) };
}

export function parseInline(text: string): readonly Inline[] {
  const parts: Inline[] = [];
  let at = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > at) {
      parts.push({ kind: 'text', text: text.slice(at, match.index) });
    }
    parts.push(tokenOf(match[0]));
    at = match.index + match[0].length;
  }
  if (at < text.length) {
    parts.push({ kind: 'text', text: text.slice(at) });
  }
  return parts;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const FENCE = /^```\s*([\w+-]*)\s*$/;

class Cursor {
  private index = 0;

  constructor(private readonly lines: readonly string[]) {}

  get done(): boolean {
    return this.index >= this.lines.length;
  }

  get line(): string {
    return this.lines[this.index] ?? '';
  }

  peek(): string {
    return this.lines[this.index + 1] ?? '';
  }

  skip(): void {
    this.index += 1;
  }

  takeWhile(test: (line: string) => boolean): string[] {
    const taken: string[] = [];
    while (!this.done && test(this.line)) {
      taken.push(this.line);
      this.skip();
    }
    return taken;
  }
}

function codeBlock(cursor: Cursor, language: string): Block {
  cursor.skip();
  const body = cursor.takeWhile((line) => line.trim() !== '```');
  cursor.skip();
  return { kind: 'code', language, code: body.join('\n') };
}

function listBlock(cursor: Cursor, pattern: RegExp, ordered: boolean): Block {
  const lines = cursor.takeWhile((line) => pattern.test(line));
  return {
    kind: 'list',
    ordered,
    items: lines.map((line) => parseInline(pattern.exec(line)?.[1] ?? line)),
  };
}

const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function cellsOf(line: string): readonly (readonly Inline[])[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => parseInline(cell.trim()));
}

function tableBlock(cursor: Cursor): Block {
  const header = cellsOf(cursor.line);
  cursor.skip();
  cursor.skip();
  const rows = cursor.takeWhile((line) => TABLE_ROW.test(line)).map(cellsOf);
  return { kind: 'table', header, rows };
}

function startsTable(cursor: Cursor): boolean {
  return TABLE_ROW.test(cursor.line) && TABLE_RULE.test(cursor.peek());
}

function special(line: string): boolean {
  return (
    line.trim() === '' ||
    TABLE_ROW.test(line) ||
    FENCE.test(line) ||
    HEADING.test(line) ||
    BULLET.test(line) ||
    NUMBERED.test(line) ||
    line.startsWith('>')
  );
}

function headingBlock(cursor: Cursor, heading: RegExpExecArray): Block {
  cursor.skip();
  const level = heading[1]?.length ?? 1;
  return {
    kind: 'heading',
    level: level === 1 ? 1 : level === 2 ? 2 : 3,
    inline: parseInline(heading[2] ?? ''),
  };
}

function quoteBlock(cursor: Cursor): Block {
  const quoted = cursor.takeWhile((next) => next.startsWith('>'));
  return {
    kind: 'quote',
    inline: parseInline(quoted.map((next) => next.replace(/^>\s?/, '')).join('\n')),
  };
}

function paragraph(cursor: Cursor): Block {
  const first = cursor.line;
  cursor.skip();
  const rest = cursor.takeWhile((next) => !special(next));
  return { kind: 'paragraph', inline: parseInline([first, ...rest].join('\n')) };
}

function nextBlock(cursor: Cursor): Block | null {
  const line = cursor.line;
  const fence = FENCE.exec(line);
  if (fence !== null) {
    return codeBlock(cursor, fence[1] ?? '');
  }
  const heading = HEADING.exec(line);
  if (heading !== null) {
    return headingBlock(cursor, heading);
  }
  if (BULLET.test(line) || NUMBERED.test(line)) {
    return BULLET.test(line) ? listBlock(cursor, BULLET, false) : listBlock(cursor, NUMBERED, true);
  }
  if (line.startsWith('>')) {
    return quoteBlock(cursor);
  }
  if (startsTable(cursor)) {
    return tableBlock(cursor);
  }
  if (line.trim() === '') {
    cursor.skip();
    return null;
  }
  return paragraph(cursor);
}

export function parseMarkdown(text: string): readonly Block[] {
  const cursor = new Cursor(text.replaceAll('\r\n', '\n').split('\n'));
  const blocks: Block[] = [];
  while (!cursor.done) {
    const block = nextBlock(cursor);
    if (block !== null) {
      blocks.push(block);
    }
  }
  return blocks;
}

function inlineText(inline: readonly Inline[]): string {
  return inline.map((part) => part.text).join('');
}

function blockText(block: Block): string {
  switch (block.kind) {
    case 'paragraph':
    case 'heading':
    case 'quote':
      return inlineText(block.inline);
    case 'list':
      return block.items.map(inlineText).join(' · ');
    case 'code':
      return block.code;
    case 'table':
      return block.header.map(inlineText).join(' · ');
  }
}

export function plainText(markdown: string): string {
  return parseMarkdown(markdown).map(blockText).join(' ').replace(/\s+/g, ' ').trim();
}
