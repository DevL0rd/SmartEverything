import {
  type FileEntry,
  type FileSearchQuery,
  type FileSearchResult,
} from '@smarteverything/domain';
import { randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeFailureError } from '../../node-failure';
import type { FileScope } from './file-scope';
import { UNREADABLE, orElse } from './fs-fallback';
import { describeEntry } from '../home-files';

const MATCHES_PER_PAGE = 200;
const SCAN_BUDGET_MS = 1500;
const IDLE_EXPIRY_MS = 10 * 60_000;
const OPEN_SEARCHES = 8;
const PSEUDO_FOLDERS: ReadonlySet<string> = new Set(['/proc', '/sys', '/dev']);

export interface SearchClock {
  readonly now: () => number;
  readonly newId: () => string;
}

const REAL_CLOCK: SearchClock = { now: Date.now, newId: randomUUID };

class SearchWalk {
  readonly pending: string[];
  scanned = 0;
  touchedAt: number;
  private head = 0;

  constructor(
    root: string,
    private readonly text: string,
    now: number,
  ) {
    this.pending = [root];
    this.touchedAt = now;
  }

  get finished(): boolean {
    return this.head >= this.pending.length;
  }

  async advance(clock: SearchClock): Promise<FileEntry[]> {
    const matches: FileEntry[] = [];
    const deadline = clock.now() + SCAN_BUDGET_MS;
    while (!this.finished && matches.length < MATCHES_PER_PAGE && clock.now() < deadline) {
      matches.push(...(await this.scanNext()));
    }
    return matches;
  }

  private async scanNext(): Promise<FileEntry[]> {
    const folder = this.pending[this.head] ?? '';
    this.head += 1;
    const entries = await orElse<Dirent[]>(
      readdir(folder, { withFileTypes: true }),
      [],
      UNREADABLE,
    );
    const matches: FileEntry[] = [];
    for (const entry of entries) {
      this.scanned += 1;
      const path = join(folder, entry.name);
      if (entry.isDirectory() && !PSEUDO_FOLDERS.has(path)) {
        this.pending.push(path);
      }
      const described = entry.name.toLowerCase().includes(this.text)
        ? await describeEntry(folder, entry)
        : null;
      if (described !== null) {
        matches.push(described);
      }
    }
    return matches;
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
      this.walks.delete(id);
    }
    return { path: query.path, matches, scanned: walk.scanned, next: walk.finished ? null : id };
  }

  private async begin(query: FileSearchQuery): Promise<string> {
    const root = await this.scope.folder(query.path);
    const id = this.clock.newId();
    this.walks.set(id, new SearchWalk(root, query.text.toLowerCase(), this.clock.now()));
    for (const old of [...this.walks.keys()].slice(
      0,
      Math.max(0, this.walks.size - OPEN_SEARCHES),
    )) {
      this.walks.delete(old);
    }
    return id;
  }

  private expire(): void {
    for (const [id, walk] of this.walks) {
      if (this.clock.now() - walk.touchedAt > IDLE_EXPIRY_MS) {
        this.walks.delete(id);
      }
    }
  }
}
