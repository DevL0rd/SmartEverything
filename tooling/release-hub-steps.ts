import { clearPhotoFolderReceipts } from './release-photo-folders.ts';
import { rmSync } from 'node:fs';
import { Logger } from '@smarteverything/logging';
import {
  builtServiceProblems,
  checkMigrations,
  freeSpaceProblem,
  pruneBackups,
  pruneReleaseLeftovers,
  ReleaseStepError,
  type ReleaseTarget,
} from './release-hub-files.ts';

const log = new Logger('tool.release-hub');

export interface Plan {
  readonly title: string;
  readonly run: () => Promise<void>;
}

export function settled(work: () => void): Promise<void> {
  try {
    work();
    return Promise.resolve();
  } catch (cause) {
    return Promise.reject(cause instanceof Error ? cause : new Error(String(cause)));
  }
}

export function checkBuild(target: ReleaseTarget, built: string): void {
  const missing = builtServiceProblems(built);
  const space = missing.length === 0 ? freeSpaceProblem(target, built) : null;
  const problems = [...missing, ...(space === null ? [] : [space])];
  if (problems.length > 0) throw new ReleaseStepError('preflight', problems.join('; '));
}

export function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function finishRelease(target: ReleaseTarget, name: string): void {
  clearPhotoFolderReceipts(target.data.system.database.file);
  rmSync(`${target.install.service}.old-${name}`, { recursive: true, force: true });
  pruneReleaseLeftovers(target, null);
  const removed = pruneBackups(target.data);
  log.info('release.backups_pruned', { removed: removed.length });
}

export function migrationStep(target: ReleaseTarget, record: (moved: boolean) => void): Plan {
  return {
    title: 'run the migrations twice on a copy of the live database',
    run: async (): Promise<void> => {
      const { from, to } = await checkMigrations(target.data);
      record(from !== to);
      log.info('release.migrations_checked', { from, to });
    },
  };
}
