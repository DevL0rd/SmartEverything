import type { ClaudeThreadItem, ClaudeThreadPage } from '@smarteverything/domain';
import { ClaudeCursorError } from './errors';
import { endsWithNewline, linesBackward, sizeOf, type RawLine } from './transcript-file';
import { parseLine } from './transcript-items';

const PAGE_SCAN_BYTES = 32 * 1024 * 1024;
const CONTEXT_SCAN_BYTES = 8 * 1024 * 1024;

const EMPTY_PAGE: ClaudeThreadPage = { items: [], older: null, skipped: 0 };

class PageCollector {
  private readonly newestFirst: (readonly ClaudeThreadItem[])[] = [];
  private count = 0;
  private skipped = 0;

  constructor(private readonly limit: number) {}

  get full(): boolean {
    return this.count >= this.limit;
  }

  add(raw: RawLine): void {
    const result = parseLine(raw);
    if (result.kind === 'skipped') {
      this.skipped += 1;
    } else if (result.kind === 'parsed') {
      this.newestFirst.push(result.items);
      this.count += result.items.length;
    }
  }

  page(older: string | null): ClaudeThreadPage {
    return { items: [...this.newestFirst].reverse().flat(), older, skipped: this.skipped };
  }
}

async function* committedLines(path: string, size: number, end: number): AsyncGenerator<RawLine> {
  let unfinished = end === size && !(await endsWithNewline(path, size));
  for await (const raw of linesBackward(path, end)) {
    if (unfinished) {
      unfinished = false;
    } else {
      yield raw;
    }
  }
}

export async function readThreadPage(
  path: string,
  before: number | null,
  limit: number,
): Promise<ClaudeThreadPage> {
  const size = await sizeOf(path);
  if (size === null) {
    return EMPTY_PAGE;
  }
  if (before !== null && before > size) {
    throw new ClaudeCursorError(before, size);
  }
  const end = before ?? size;
  const collector = new PageCollector(limit);
  for await (const raw of committedLines(path, size, end)) {
    collector.add(raw);
    if (collector.full || end - raw.offset > PAGE_SCAN_BYTES) {
      return collector.page(raw.offset > 0 ? String(raw.offset) : null);
    }
  }
  return collector.page(null);
}

export async function lastContext(path: string): Promise<number | null> {
  const size = await sizeOf(path);
  if (size === null) {
    return null;
  }
  for await (const raw of linesBackward(path, size)) {
    const result = parseLine(raw);
    if (result.kind === 'parsed' && result.context !== null) {
      return result.context;
    }
    if (size - raw.offset > CONTEXT_SCAN_BYTES) {
      return null;
    }
  }
  return null;
}
