import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  UPDATE_REVISIONS,
  UPDATE_REVISIONS_FILE,
  type UpdateRevision,
  type UpdateRevisions,
} from '@smarteverything/domain';
import { CommandLanes } from '../commands/lanes';
import type { HubLayout } from '../data-layout';
import { isMissing } from '../fs-util';

const LANE = 'revisions';

export class RevisionRecord {
  private readonly lanes = new CommandLanes();

  constructor(private readonly file: string) {}

  static of(layout: HubLayout): RevisionRecord {
    return new RevisionRecord(join(layout.system.updates.selfUpdate, UPDATE_REVISIONS_FILE));
  }

  async list(): Promise<readonly UpdateRevision[]> {
    return (await this.read()).revisions;
  }

  save(revision: UpdateRevision): Promise<void> {
    return this.lanes.run(LANE, async () => {
      const { revisions } = await this.read();
      const next = revisions.some((entry) => entry.id === revision.id)
        ? revisions.map((entry) => (entry.id === revision.id ? revision : entry))
        : [...revisions, revision];
      await this.write(UPDATE_REVISIONS.parse({ revisions: next }));
    });
  }

  private async read(): Promise<UpdateRevisions> {
    try {
      return UPDATE_REVISIONS.parse(JSON.parse(await readFile(this.file, 'utf8')));
    } catch (cause) {
      if (isMissing(cause)) return { revisions: [] };
      throw cause;
    }
  }

  private async write(revisions: UpdateRevisions): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    const staged = `${this.file}.next`;
    try {
      await writeFile(staged, JSON.stringify(revisions), { mode: 0o600 });
      await rename(staged, this.file);
    } finally {
      await rm(staged, { force: true });
    }
  }
}
