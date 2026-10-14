import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { constants, watch } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { lstat, mkdir, open, readdir, rename, rm } from 'node:fs/promises';
import { z } from 'zod';
import { SubscriptionProviderError } from '../providers/errors';
import type { SubscriptionStorage } from './contracts';

const STORAGE_KEY = z.union([
  z.literal('host'),
  z.string().regex(/^(route-|registration-)[a-zA-Z0-9_-]{1,100}$/),
]);
const OWNER_DIRECTORY_MODE = 0o700;
const OWNER_FILE_MODE = 0o600;
const SQLITE_BUSY_ERRCODE = 5;

function missing(error: unknown): boolean {
  const parsed = z.object({ code: z.string() }).safeParse(error);
  return parsed.success && parsed.data.code === 'ENOENT';
}

export class LocalSubscriptionStorage implements SubscriptionStorage {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly directory: string) {
    if (process.platform === 'win32')
      throw new SubscriptionProviderError(
        'STORAGE_FAILED',
        'Windows credentials require a host storage port that verifies owner-only ACL protection.',
      );
    if (!isAbsolute(directory))
      throw new SubscriptionProviderError(
        'STORAGE_FAILED',
        'Credential directory must be absolute.',
      );
  }

  async routes(): Promise<readonly string[]> {
    await this.prepare();
    return (await readdir(this.directory)).flatMap((name) =>
      /^route-[a-zA-Z0-9_-]{1,100}\.json$/.test(name) ? [name.slice(6, -5)] : [],
    );
  }

  async read(key: string): Promise<unknown> {
    const path = this.path(key);
    try {
      await this.assertProtected(path, false);
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const raw = await file.readFile('utf8');
        return z.unknown().parse(JSON.parse(raw));
      } finally {
        await file.close();
      }
    } catch (error) {
      if (missing(error)) return undefined;
      throw new SubscriptionProviderError('STORAGE_FAILED', 'Protected credential read failed.');
    }
  }

  async write(key: string, value: unknown, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    await this.prepare();
    signal?.throwIfAborted();
    const temporary = join(this.directory, `${randomUUID()}.tmp`);
    const file = await open(temporary, 'wx', OWNER_FILE_MODE);
    try {
      await file.writeFile(JSON.stringify(value));
      await file.sync();
      await file.close();
      signal?.throwIfAborted();
      await rename(temporary, this.path(key));
      const directory = await open(this.directory, 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } catch (error) {
      await file.close();
      await rm(temporary, { force: true });
      signal?.throwIfAborted();
      throw new SubscriptionProviderError(
        'STORAGE_FAILED',
        `Credential write failed (${error instanceof Error ? error.name : 'unknown'}).`,
      );
    }
  }

  async remove(key: string): Promise<void> {
    await this.prepare();
    await rm(this.path(key), { force: true });
    const directory = await open(this.directory, 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }

  exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(() => this.locked(operation));
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  watch(listener: (key: string) => void): () => void {
    const watcher = watch(this.directory, { persistent: false }, (_event, filename) => {
      if (filename !== null && filename.startsWith('route-') && filename.endsWith('.json'))
        listener(filename.slice(0, -5));
    });
    watcher.on('error', () => {
      listener('*');
    });
    return (): void => {
      watcher.close();
    };
  }

  private async locked<T>(operation: () => Promise<T>): Promise<T> {
    await this.prepare();
    const path = join(this.directory, 'ownership.sqlite');
    await this.prepareLockFile(path);
    await this.assertProtected(path, false);
    const database = this.lockDatabase(path);
    try {
      return await operation();
    } finally {
      database.close();
    }
  }

  private lockDatabase(path: string): DatabaseSync {
    let database: DatabaseSync | undefined;
    try {
      database = new DatabaseSync(path, { timeout: 0, allowExtension: false });
      database.exec('BEGIN EXCLUSIVE');
      return database;
    } catch (error) {
      database?.close();
      const contention = z.object({ errcode: z.literal(SQLITE_BUSY_ERRCODE) }).safeParse(error);
      throw new SubscriptionProviderError(
        contention.success ? 'AUTH_BUSY' : 'STORAGE_FAILED',
        `Credential ownership lock unavailable (${error instanceof Error ? error.name : 'unknown'}).`,
      );
    }
  }

  private async prepareLockFile(path: string): Promise<void> {
    try {
      const file = await open(
        path,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
        OWNER_FILE_MODE,
      );
      await file.close();
    } catch (error) {
      const existing = z.object({ code: z.literal('EEXIST') }).safeParse(error);
      if (existing.success) return;
      throw new SubscriptionProviderError(
        'STORAGE_FAILED',
        'Credential lock file creation failed.',
      );
    }
  }

  private async prepare(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: OWNER_DIRECTORY_MODE });
    await this.assertProtected(this.directory, true);
  }

  private async assertProtected(path: string, directory: boolean): Promise<void> {
    const stat = await lstat(path);
    if (process.getuid !== undefined && stat.uid !== process.getuid())
      throw new SubscriptionProviderError(
        'STORAGE_FAILED',
        'Credential storage is owned by another operating-system user.',
      );
    if (stat.isSymbolicLink() || stat.isDirectory() !== directory || (stat.mode & 0o077) !== 0)
      throw new SubscriptionProviderError(
        'STORAGE_FAILED',
        'Credential storage must be owner-only and contain no symbolic link.',
      );
    if (!directory && !stat.isFile())
      throw new SubscriptionProviderError(
        'STORAGE_FAILED',
        'Credential record must be a regular file.',
      );
  }

  private path(key: string): string {
    return join(this.directory, `${STORAGE_KEY.parse(key)}.json`);
  }
}
