import { basename, dirname } from 'node:path';
import type { ClaudeThreadItem } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { PathWatch } from './fs-watch';
import { readAppended, sizeOf, type RawLine } from './transcript-file';
import { parseLine } from './transcript-items';
import { lastContext } from './transcript-page';

interface TailEvents {
  readonly appended: (sessionId: string, items: readonly ClaudeThreadItem[]) => void;
  readonly context: (sessionId: string, tokens: number | null) => void;
}

interface Tail {
  readonly sessionId: string;
  readonly path: string;
  readonly watch: PathWatch;
}

export interface TranscriptTailsOptions {
  readonly settleMs: number;
  readonly events: TailEvents;
  readonly log: Logger;
}

export class TranscriptTails {
  private readonly tails = new Map<string, Tail>();
  private readonly offsets = new Map<string, number>();
  private readonly starting = new Set<string>();
  private readonly reading = new Set<string>();
  private readonly again = new Set<string>();

  constructor(private readonly options: TranscriptTailsOptions) {}

  followed(): ReadonlySet<string> {
    return new Set(this.tails.keys());
  }

  async follow(sessionId: string, path: string): Promise<void> {
    if (this.tails.get(sessionId)?.path === path || this.starting.has(sessionId)) {
      return;
    }
    this.unfollow(sessionId);
    this.starting.add(sessionId);
    let offset: number;
    try {
      offset = (await sizeOf(path)) ?? 0;
    } catch (cause) {
      this.starting.delete(sessionId);
      throw cause;
    }
    if (!this.starting.delete(sessionId)) {
      return;
    }
    this.offsets.set(sessionId, offset);
    this.startTail(sessionId, path);
    this.options.events.context(sessionId, await lastContext(path));
  }

  unfollow(sessionId: string): void {
    this.starting.delete(sessionId);
    this.tails.get(sessionId)?.watch.stop();
    this.tails.delete(sessionId);
    this.offsets.delete(sessionId);
  }

  stop(): void {
    for (const sessionId of [...this.tails.keys()]) {
      this.unfollow(sessionId);
    }
  }

  private startTail(sessionId: string, path: string): void {
    const watch = new PathWatch({
      directory: dirname(path),
      recursive: false,
      settleMs: this.options.settleMs,
      accepts: (name): boolean => name === basename(path),
      log: this.options.log,
      changed: (): void => {
        this.read(sessionId).catch((cause: unknown) => {
          this.options.log.error('transcript.read_failed', cause, { session: sessionId });
        });
      },
    });
    this.tails.set(sessionId, { sessionId, path, watch });
    watch.start();
  }

  private async read(sessionId: string): Promise<void> {
    if (this.reading.has(sessionId)) {
      this.again.add(sessionId);
      return;
    }
    this.reading.add(sessionId);
    try {
      let more: boolean;
      do {
        this.again.delete(sessionId);
        more = await this.readNew(sessionId);
      } while (more || this.again.has(sessionId));
    } finally {
      this.reading.delete(sessionId);
    }
  }

  private async readNew(sessionId: string): Promise<boolean> {
    const tail = this.tails.get(sessionId);
    const offset = this.offsets.get(sessionId);
    if (tail === undefined || offset === undefined) {
      return false;
    }
    const size = await sizeOf(tail.path);
    if (size === null || size === offset) {
      return false;
    }
    if (size < offset) {
      this.options.log.warn('transcript.shrunk', { session: sessionId });
      this.offsets.set(sessionId, size);
      return false;
    }
    const appended = await readAppended(tail.path, offset, size);
    this.offsets.set(sessionId, appended.next);
    this.publish(sessionId, appended.lines);
    return appended.next < size;
  }

  private publish(sessionId: string, lines: readonly RawLine[]): void {
    const items: ClaudeThreadItem[] = [];
    let context: number | null = null;
    let skipped = 0;
    for (const raw of lines) {
      const result = parseLine(raw);
      if (result.kind === 'skipped') {
        skipped += 1;
      } else if (result.kind === 'parsed') {
        items.push(...result.items);
        context = result.context ?? context;
      }
    }
    if (skipped > 0) {
      this.options.log.warn('transcript.lines_skipped', { session: sessionId, count: skipped });
    }
    if (context !== null) {
      this.options.events.context(sessionId, context);
    }
    if (items.length > 0) {
      this.options.events.appended(sessionId, items);
    }
  }
}
