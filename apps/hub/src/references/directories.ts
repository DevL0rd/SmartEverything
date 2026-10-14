import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { z } from 'zod';
import { AI_PROJECT_PATH, ApiError } from '@smarteverything/domain';

const DIRECTORY = z.strictObject({ id: z.int().positive(), path: AI_PROJECT_PATH });
const CACHE_KIB = 256;
interface DirectoryStorage {
  readonly insert: StatementSync;
  readonly next: StatementSync;
  readonly remove: StatementSync;
}
export class ReferenceDirectories {
  private readonly roots: string[];
  private stored: DirectoryStorage | undefined;
  private database: DatabaseSync | undefined;
  private folder: string | undefined;
  private count = 0;
  private closed = false;
  constructor(roots: readonly string[]) {
    this.roots = [...roots];
  }
  get pending(): boolean {
    return this.roots.length > 0 || this.count > 0;
  }
  async add(path: string): Promise<void> {
    this.assertOpen();
    AI_PROJECT_PATH.parse(path);
    const stored = await this.storage();
    stored.insert.run(path);
    this.count += 1;
  }
  take(): string | undefined {
    this.assertOpen();
    const root = this.roots.shift();
    if (root !== undefined) return root;
    const stored = this.stored;
    if (stored === undefined) return undefined;
    const raw = stored.next.get();
    if (raw === undefined) return undefined;
    const row = DIRECTORY.parse(raw);
    stored.remove.run(row.id);
    this.count -= 1;
    return row.path;
  }
  private async storage(): Promise<DirectoryStorage> {
    if (this.stored !== undefined) return this.stored;
    const folder = await mkdtemp(join(tmpdir(), 'smarteverything-reference-directories-'));
    this.folder = folder;
    this.assertOpen();
    const database = new DatabaseSync(join(folder, 'directories.sqlite'), {
      allowExtension: false,
    });
    this.database = database;
    database.exec(`pragma cache_size=-${String(CACHE_KIB)}`);
    database.exec('pragma journal_mode=memory');
    database.exec('pragma temp_store=file');
    database.exec('create table directories(id integer primary key, path text not null) strict');
    const stored = {
      insert: database.prepare('insert into directories(path) values(?)'),
      next: database.prepare('select id,path from directories order by id limit 1'),
      remove: database.prepare('delete from directories where id=?'),
    };
    this.stored = stored;
    return stored;
  }
  private assertOpen(): void {
    if (this.closed)
      throw new ApiError('conflict', 'The reference directory continuation is closed.');
  }
  async close(): Promise<void> {
    this.closed = true;
    const database = this.database;
    const folder = this.folder;
    this.stored = undefined;
    this.database = undefined;
    this.folder = undefined;
    try {
      database?.close();
    } finally {
      if (folder !== undefined) await rm(folder, { recursive: true, force: true });
    }
  }
}
