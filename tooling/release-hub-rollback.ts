import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { HUB_UNIT } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { clearPhotoFolderReceipts, restorePhotoFolders } from './release-photo-folders.ts';
import { withHubDataLock } from './release-hub-prepare.ts';
import {
  markBackup,
  ReleaseStepError,
  restoreDatabase,
  restoreService,
  rollbackPreflight,
  schemaVersionOf,
  type ReleaseTarget,
} from './release-hub-files.ts';
import { awaitHub, verifyHub, type Units } from './release-hub-verify.ts';
import { legacyLayoutOf, undoV1, type TransitionEnvironment } from './release-hub-transition.ts';
import { finishRelease } from './release-hub-steps.ts';

const log = new Logger('tool.release-hub');

export interface RollbackOptions {
  readonly target: ReleaseTarget;
  readonly environment: TransitionEnvironment;
  readonly units: Units;
  readonly backup: string;
  readonly url: string;
  readonly withDatabase: boolean;
  readonly stamp: string;
}

export async function rollbackWith(options: RollbackOptions): Promise<void> {
  const { target, environment, units, backup, url, withDatabase, stamp } = options;
  const { install } = target;
  const { scene, problems } = rollbackPreflight(target, backup, withDatabase, environment);
  if (problems.length > 0) throw new ReleaseStepError('rollback preflight', problems.join('; '));
  units.stop(HUB_UNIT);
  const data = scene.undo ? legacyLayoutOf(target.data.root) : target.data;
  const restoration = await withHubDataLock(target.data.root, async () => {
    const restored = scene.undo ? await undoV1(data.root, scene.backup, environment) : scene.backup;
    const savedDatabase = join(restored, 'smarteverything.db');
    const movedFiles = existsSync(savedDatabase) && restorePhotoFolders(savedDatabase);
    const restoreSavedDatabase = withDatabase || movedFiles;
    restoreService(install, restored, stamp);
    if (restoreSavedDatabase) restoreDatabase(data, restored, stamp);
    return {
      restored,
      expected: restoreSavedDatabase ? schemaVersionOf(savedDatabase) : null,
      restoreSavedDatabase,
    };
  });
  const { restored, expected, restoreSavedDatabase } = restoration;
  const since = new Date();
  units.start(HUB_UNIT);
  await awaitHub(data.system.logs.service, url, since);
  const checked = await verifyHub(data, url, units, expected);
  const failed = checked.filter((check) => !check.ok);
  if (failed.length > 0)
    throw new ReleaseStepError(
      'rollback verification',
      failed.map((check) => check.detail).join('; '),
    );
  markBackup(restored, 'rolled-back');
  clearPhotoFolderReceipts(join(restored, 'smarteverything.db'));
  finishRelease({ install, data }, stamp);
  log.info('release.rolled_back', { backup: restored, withDatabase: restoreSavedDatabase });
}
