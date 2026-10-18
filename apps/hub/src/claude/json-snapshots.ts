import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { Diagnostics, ClaudeSource } from './diagnostics';
import { ClaudeFileReadError } from './errors';
import type { JsonEntry } from './json-files';
import { messageOf } from '@smarteverything/logging';
import { isMissing } from '../fs-util';

interface SnapshotOptions<T> {
  readonly source: ClaudeSource;
  readonly directory: string;
  readonly recursive: boolean;
  readonly accepts: (name: string) => boolean;
  readonly schema: z.ZodType<T>;
  readonly diagnostics: Diagnostics;
  readonly snapshot: string;
  readonly identity?: (name: string, value: T) => string;
  readonly acceptsValue?: (name: string, value: T) => boolean;
}

export class JsonSnapshots<T> {
  private readonly entries = new Map<string, JsonEntry<T>>();
  private loaded = false;
  private pending: Promise<void> = Promise.resolve();
  private scanning: Promise<void> | null = null;
  private dirty = false;
  constructor(private readonly options: SnapshotOptions<T>) {}

  all(): ReadonlyMap<string, JsonEntry<T>> {
    return this.entries;
  }

  async refresh(): Promise<void> {
    this.scanning ??= this.serialise(() => this.scan());
    try {
      await this.scanning;
    } finally {
      this.scanning = null;
    }
  }

  settled(): Promise<void> {
    return this.pending.then(
      (): void => undefined,
      (): void => undefined,
    );
  }

  retain(name: string, value: T): Promise<void> {
    const parsed = this.options.schema.parse(value);
    return this.serialise(async (): Promise<void> => {
      await this.load();
      this.remember(name, parsed);
      await this.save();
    });
  }

  private serialise(work: () => Promise<void>): Promise<void> {
    const result = this.pending.then(work, work);
    this.pending = result;
    return result;
  }

  private identity(name: string, value: T): string {
    return this.options.identity === undefined ? name : this.options.identity(name, value);
  }

  private remember(name: string, value: T): void {
    const key = this.identity(name, value);
    if (JSON.stringify(this.entries.get(key)?.value) === JSON.stringify(value)) return;
    this.entries.set(key, { value, present: true });
    this.dirty = true;
  }

  private async scan(): Promise<void> {
    await this.load();
    const { directory, recursive, accepts, diagnostics, source } = this.options;
    let names: string[];
    try {
      names = (await readdir(directory, { recursive })).filter(accepts);
    } catch (cause) {
      if (!isMissing(cause)) throw new ClaudeFileReadError(directory, cause);
      diagnostics.report(
        source,
        directory,
        'The legacy source is unavailable; retained metadata remains readable.',
      );
      await this.save();
      return;
    }
    diagnostics.clear(source, directory);
    for (const name of names) await this.readSource(name);
    await this.save();
  }

  private async readSource(name: string): Promise<void> {
    const { source, directory, schema, diagnostics } = this.options;
    const text = await this.read(join(directory, name));
    if (text === null) return;
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (cause) {
      diagnostics.report(source, name, messageOf(cause));
      return;
    }
    const result = schema.safeParse(json);
    if (!result.success) {
      diagnostics.report(source, name, result.error.message);
      return;
    }
    if (this.options.acceptsValue?.(name, result.data) === false) return;
    diagnostics.clear(source, name);
    this.remember(name, result.data);
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    const text = await this.read(this.options.snapshot);
    if (text !== null) {
      const parsed = z.record(z.string(), this.options.schema).parse(JSON.parse(text));
      for (const [name, value] of Object.entries(parsed)) {
        const key = this.identity(name, value);
        this.entries.set(key, { value, present: true });
        if (key !== name) this.dirty = true;
      }
    }
    this.loaded = true;
  }

  private async save(): Promise<void> {
    if (!this.dirty) return;
    const file = this.options.snapshot;
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(
      `${file}.tmp`,
      JSON.stringify(
        Object.fromEntries([...this.entries].map(([name, entry]) => [name, entry.value])),
      ),
      { mode: 0o600 },
    );
    await rename(`${file}.tmp`, file);
    this.dirty = false;
  }

  private async read(file: string): Promise<string | null> {
    try {
      return await readFile(file, 'utf8');
    } catch (cause) {
      if (isMissing(cause)) return null;
      throw new ClaudeFileReadError(file, cause);
    }
  }
}
