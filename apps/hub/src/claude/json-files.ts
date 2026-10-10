import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import type { z } from 'zod';
import type { Diagnostics, ClaudeSource } from './diagnostics';
import { ClaudeFileReadError } from './errors';
import { PathWatch } from './fs-watch';

const READ_ATTEMPTS = 4;
const READ_RETRY_MS = 50;

export interface JsonEntry<T> {
  readonly value: T;
  readonly present: boolean;
}

export interface JsonFilesOptions<T> {
  readonly source: ClaudeSource;
  readonly directory: string;
  readonly recursive: boolean;
  readonly accepts: (name: string) => boolean;
  readonly schema: z.ZodType<T>;
  readonly settleMs: number;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly diagnostics: Diagnostics;
  readonly changed: () => void;
  readonly log: Logger;
}

function isMissing(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}

function issuesText(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || 'value'}: ${issue.message}`)
    .join('; ');
}

interface Settle {
  readonly resolve: () => void;
  readonly reject: (cause: unknown) => void;
}

type JsonRead =
  | { readonly kind: 'gone' }
  | { readonly kind: 'invalid'; readonly reason: string }
  | { readonly kind: 'json'; readonly value: unknown };

export class JsonFiles<T> {
  private readonly entries = new Map<string, JsonEntry<T>>();
  private readonly generations = new Map<string, number>();
  private readonly watch: PathWatch;
  private firstScan: Settle | null = null;

  constructor(private readonly options: JsonFilesOptions<T>) {
    this.watch = new PathWatch({
      directory: options.directory,
      recursive: options.recursive,
      settleMs: options.settleMs,
      accepts: options.accepts,
      log: options.log,
      changed: (name): void => {
        this.onEvent(name);
      },
    });
  }

  start(): Promise<void> {
    const scanned = new Promise<void>((resolve, reject) => {
      this.firstScan = { resolve, reject };
    });
    if (!this.watch.start()) {
      this.settleFirstScan();
    }
    return scanned;
  }

  stop(): void {
    this.watch.stop();
  }

  all(): ReadonlyMap<string, JsonEntry<T>> {
    return this.entries;
  }

  private onEvent(name: string | null): void {
    const work = name === null ? this.rescan() : this.load(name);
    work.catch((cause: unknown) => {
      this.options.log.error('file.read_failed', cause, { source: this.options.source });
      this.firstScan?.reject(cause);
      this.firstScan = null;
    });
  }

  private settleFirstScan(): void {
    this.firstScan?.resolve();
    this.firstScan = null;
  }

  private async rescan(): Promise<void> {
    const { directory, accepts, recursive } = this.options;
    let names: string[];
    try {
      names = (await readdir(directory, { recursive })).filter(accepts);
    } catch (cause) {
      if (!isMissing(cause)) {
        throw new ClaudeFileReadError(directory, cause);
      }
      names = [];
    }
    await Promise.all(names.map((name) => this.load(name)));
    for (const name of [...this.entries.keys()].filter((known) => !names.includes(known))) {
      this.markGone(name);
    }
    this.settleFirstScan();
  }

  private markGone(name: string): void {
    const entry = this.entries.get(name);
    if (entry?.present !== true) {
      return;
    }
    this.entries.set(name, { value: entry.value, present: false });
    this.options.diagnostics.clear(this.options.source, name);
    this.options.changed();
  }

  private async load(name: string): Promise<void> {
    const generation = (this.generations.get(name) ?? 0) + 1;
    this.generations.set(name, generation);
    const read = await this.readJson(name);
    if (this.generations.get(name) !== generation) {
      return;
    }
    if (read.kind === 'gone') {
      this.markGone(name);
    } else if (read.kind === 'invalid') {
      this.options.diagnostics.report(this.options.source, name, read.reason);
    } else {
      this.accept(name, read.value);
    }
  }

  private accept(name: string, json: unknown): void {
    const { source, schema, diagnostics } = this.options;
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      diagnostics.report(source, name, `unexpected shape: ${issuesText(parsed.error)}`);
      return;
    }
    diagnostics.clear(source, name);
    const previous = this.entries.get(name);
    this.entries.set(name, { value: parsed.data, present: true });
    if (
      previous?.present !== true ||
      JSON.stringify(previous.value) !== JSON.stringify(parsed.data)
    ) {
      this.options.changed();
    }
  }

  private async readJson(name: string): Promise<JsonRead> {
    const path = join(this.options.directory, name);
    for (let attempt = 1; ; attempt += 1) {
      const text = await this.readOnce(path);
      if (text === null) {
        return { kind: 'gone' };
      }
      try {
        return { kind: 'json', value: JSON.parse(text) };
      } catch (cause) {
        if (attempt >= READ_ATTEMPTS) {
          const reason = cause instanceof Error ? cause.message : String(cause);
          return { kind: 'invalid', reason: `not valid JSON: ${reason}` };
        }
      }
      await this.options.sleep(READ_RETRY_MS);
    }
  }

  private async readOnce(path: string): Promise<string | null> {
    try {
      return await readFile(path, 'utf8');
    } catch (cause) {
      if (isMissing(cause)) {
        return null;
      }
      throw new ClaudeFileReadError(path, cause);
    }
  }
}
