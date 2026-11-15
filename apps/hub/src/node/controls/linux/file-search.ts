import type {
  FileSearchHit,
  FileSearchMatch,
  FileSearchQuery,
  FileSearchResult,
} from '@smarteverything/domain';
import { randomUUID } from 'node:crypto';
import { createReadStream, type Dirent, type ReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { NodeFailureError } from '../../node-failure';
import type { FileScope } from './file-scope';
import { UNREADABLE, orElse } from './fs-fallback';
import { fsCode } from '../../../fs-code';
import { describeEntry, holdsText, mimeOf } from '../home-files';

const MATCHES_PER_PAGE = 200;
const SCAN_BUDGET_MS = 1500;
const IDLE_EXPIRY_MS = 10 * 60_000;
const OPEN_SEARCHES = 8;
const SNIPPET_CONTEXT = 80;
const PSEUDO_FOLDERS: ReadonlySet<string> = new Set(['/proc', '/sys', '/dev']);

export interface SearchClock {
  readonly now: () => number;
  readonly newId: () => string;
}

const REAL_CLOCK: SearchClock = { now: Date.now, newId: randomUUID };

interface Folder {
  readonly path: string;
  readonly entries: readonly Dirent[];
  at: number;
}

function rangesOf(text: string, needle: string): FileSearchHit['ranges'] {
  const lower = text.toLowerCase();
  const found: { start: number; end: number }[] = [];
  for (
    let from = lower.indexOf(needle);
    from !== -1;
    from = lower.indexOf(needle, from + needle.length)
  ) {
    found.push({ start: from, end: from + needle.length });
  }
  return found;
}

function excerptOf(line: string, needle: string): FileSearchHit | null {
  const first = line.toLowerCase().indexOf(needle);
  if (first === -1) {
    return null;
  }
  const start = Math.max(0, first - SNIPPET_CONTEXT);
  const snippet = line.slice(start, first + needle.length + SNIPPET_CONTEXT);
  const ranges = rangesOf(snippet, needle);
  return ranges.length === 0 ? null : { kind: 'text', snippet, line: null, ranges };
}

type ScanStep =
  { readonly done: false } | { readonly done: true; readonly hit: FileSearchHit | null };

class TextScan {
  private readonly decoder = new StringDecoder('utf8');
  private readonly stream: ReadStream;
  private readonly chunks: AsyncIterator<unknown>;
  private readonly keep: number;
  private window = '';
  private found = -1;
  private line = 1;

  constructor(
    path: string,
    private readonly needle: string,
  ) {
    this.stream = createReadStream(path);
    this.chunks = this.stream[Symbol.asyncIterator]();
    this.keep = SNIPPET_CONTEXT + needle.length - 1;
  }

  close(): void {
    this.stream.destroy();
  }

  async step(within: () => boolean): Promise<ScanStep> {
    try {
      while (within()) {
        const next = await this.chunks.next();
        if (next.done === true) {
          return { done: true, hit: this.feed(this.decoder.end(), true) };
        }
        const bytes = Buffer.isBuffer(next.value) ? next.value : Buffer.from(String(next.value));
        if (bytes.includes(0)) {
          this.close();
          return { done: true, hit: null };
        }
        const hit = this.feed(this.decoder.write(bytes), false);
        if (hit !== null) {
          this.close();
          return { done: true, hit };
        }
      }
      return { done: false };
    } catch (cause) {
      this.close();
      if (UNREADABLE.includes(fsCode(cause) ?? '')) {
        return { done: true, hit: null };
      }
      throw cause;
    }
  }

  private feed(text: string, last: boolean): FileSearchHit | null {
    const segments = text.split('\n');
    for (const [index, segment] of segments.entries()) {
      if (index > 0) {
        const ended = this.finish();
        if (ended !== null) {
          return ended;
        }
        this.line += 1;
        this.window = '';
        this.found = -1;
      }
      const hit = this.append(segment);
      if (hit !== null) {
        return hit;
      }
    }
    return last ? this.finish() : null;
  }

  private append(segment: string): FileSearchHit | null {
    this.window += segment;
    if (this.found === -1) {
      this.found = this.window.toLowerCase().indexOf(this.needle);
      if (this.found === -1) {
        if (this.window.length > this.keep) {
          this.window = this.window.slice(this.window.length - this.keep);
        }
        return null;
      }
    }
    return this.window.length >= this.found + this.needle.length + SNIPPET_CONTEXT
      ? this.finish()
      : null;
  }

  private finish(): FileSearchHit | null {
    if (this.found === -1) {
      return null;
    }
    const hit = excerptOf(this.window, this.needle);
    return hit === null ? null : { ...hit, line: this.line };
  }
}

interface Reading {
  readonly scan: TextScan;
  readonly folder: string;
  readonly entry: Dirent;
}

class SearchWalk {
  readonly pending: string[];
  scanned = 0;
  touchedAt: number;
  private head = 0;
  private current: Folder | null = null;
  private reading: Reading | null = null;

  constructor(
    root: string,
    private readonly text: string,
    private readonly contents: boolean,
    now: number,
  ) {
    this.pending = [root];
    this.touchedAt = now;
  }

  get finished(): boolean {
    return this.reading === null && this.current === null && this.head >= this.pending.length;
  }

  async advance(clock: SearchClock): Promise<FileSearchMatch[]> {
    const matches: FileSearchMatch[] = [];
    const deadline = clock.now() + SCAN_BUDGET_MS;
    const within = (): boolean => clock.now() < deadline;
    while (matches.length < MATCHES_PER_PAGE && within()) {
      let match: FileSearchMatch | null;
      if (this.reading === null) {
        const folder = await this.folder();
        if (folder === null) {
          break;
        }
        const entry = folder.entries[folder.at];
        folder.at += 1;
        if (folder.at >= folder.entries.length) {
          this.current = null;
        }
        match = entry === undefined ? null : await this.scan(folder.path, entry, within);
      } else {
        match = await this.read(this.reading, within);
      }
      if (match !== null) {
        matches.push(match);
      }
    }
    return matches;
  }

  private async folder(): Promise<Folder | null> {
    while (this.current === null && this.head < this.pending.length) {
      const path = this.pending[this.head] ?? '';
      this.head += 1;
      const entries = await orElse<Dirent[]>(
        readdir(path, { withFileTypes: true }),
        [],
        UNREADABLE,
      );
      if (entries.length > 0) {
        this.current = { path, entries, at: 0 };
      }
    }
    return this.current;
  }

  close(): void {
    this.reading?.scan.close();
    this.reading = null;
  }

  private async scan(
    folder: string,
    entry: Dirent,
    within: () => boolean,
  ): Promise<FileSearchMatch | null> {
    this.scanned += 1;
    const path = join(folder, entry.name);
    if (entry.isDirectory() && !PSEUDO_FOLDERS.has(path)) {
      this.pending.push(path);
    }
    const ranges = rangesOf(entry.name, this.text);
    if (ranges.length > 0) {
      return this.described(folder, entry, {
        kind: 'name',
        snippet: entry.name,
        line: null,
        ranges,
      });
    }
    if (!this.contents || !entry.isFile() || !holdsText(mimeOf(entry.name) ?? null)) {
      return null;
    }
    this.reading = { scan: new TextScan(path, this.text), folder, entry };
    return this.read(this.reading, within);
  }

  private async read(reading: Reading, within: () => boolean): Promise<FileSearchMatch | null> {
    const step = await reading.scan.step(within).catch((cause: unknown) => {
      this.reading = null;
      throw cause;
    });
    if (!step.done) {
      return null;
    }
    this.reading = null;
    return step.hit === null ? null : this.described(reading.folder, reading.entry, step.hit);
  }

  private async described(
    folder: string,
    entry: Dirent,
    hit: FileSearchHit,
  ): Promise<FileSearchMatch | null> {
    const described = await describeEntry(folder, entry);
    return described === null ? null : { entry: described, hit };
  }
}

export class FileSearch {
  private readonly walks = new Map<string, SearchWalk>();

  constructor(
    private readonly scope: FileScope,
    private readonly clock: SearchClock = REAL_CLOCK,
  ) {}

  async search(query: FileSearchQuery): Promise<FileSearchResult> {
    this.expire();
    const id = query.cursor ?? (await this.begin(query));
    const walk = this.walks.get(id);
    if (walk === undefined) {
      throw new NodeFailureError('not_found', 'That search has ended; start it again.');
    }
    walk.touchedAt = this.clock.now();
    const matches = await walk.advance(this.clock);
    if (walk.finished) {
      this.drop(id);
    }
    return { path: query.path, matches, scanned: walk.scanned, next: walk.finished ? null : id };
  }

  private async begin(query: FileSearchQuery): Promise<string> {
    const root = await this.scope.folder(query.path);
    const id = this.clock.newId();
    this.walks.set(
      id,
      new SearchWalk(root, query.text.toLowerCase(), query.contents, this.clock.now()),
    );
    for (const old of [...this.walks.keys()].slice(
      0,
      Math.max(0, this.walks.size - OPEN_SEARCHES),
    )) {
      this.drop(old);
    }
    return id;
  }

  private expire(): void {
    for (const [id, walk] of this.walks) {
      if (this.clock.now() - walk.touchedAt > IDLE_EXPIRY_MS) {
        this.drop(id);
      }
    }
  }

  private drop(id: string): void {
    this.walks.get(id)?.close();
    this.walks.delete(id);
  }
}
