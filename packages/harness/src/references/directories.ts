import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const ROW = z.object({ id: z.number(), path: z.string() });
export class NativeReferenceDirectories {
  private closed: Promise<void> | undefined;
  private constructor(
    private readonly folder: string,
    private readonly database: DatabaseSync,
  ) {}
  static async open(): Promise<NativeReferenceDirectories> {
    const folder = await mkdtemp(join(tmpdir(), 'smarteverything-reference-'));
    let database: DatabaseSync | undefined;
    try {
      database = new DatabaseSync(join(folder, 'directories.sqlite'));
      database.exec(
        'PRAGMA cache_size=-256; CREATE TABLE directories(id INTEGER PRIMARY KEY, path TEXT NOT NULL)',
      );
      return new NativeReferenceDirectories(folder, database);
    } catch (error) {
      database?.close();
      await rm(folder, { recursive: true, force: true });
      throw error;
    }
  }
  add(path: string): void {
    this.database.prepare('INSERT INTO directories(path) VALUES (?)').run(path);
  }
  take(): string | undefined {
    const raw = this.database.prepare('SELECT id,path FROM directories ORDER BY id LIMIT 1').get();
    if (raw === undefined) return undefined;
    const row = ROW.parse(raw);
    this.database.prepare('DELETE FROM directories WHERE id=?').run(row.id);
    return row.path;
  }
  close(): Promise<void> {
    this.closed ??= this.finish();
    return this.closed;
  }
  private async finish(): Promise<void> {
    try {
      this.database.close();
    } finally {
      await rm(this.folder, { recursive: true, force: true });
    }
  }
}
