import { mkdir } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import {
  hubLayout,
  layoutFromNames,
  LEGACY_NAMES,
  readMarker,
  V1_NAMES,
  verifyMarker,
  type Location,
  type HubLayout,
  type LayoutEnvironment,
} from '../data-layout';
import { lockDataDirectory } from '../data-lock';
import { finishCommitFromDisk } from '../drive/changes';
import { recoverIntents, type DriveFiles } from '../drive/intents';
import { nodeFiles } from '../drive/versions';
import { assertPhotosFolderPrepared, migratePhotosFolder } from '../photos/folder-migration';
import { DriveBackupRepository } from '../store/repositories/drive-backup';
import { openStore, type Store } from '../store/store';
import { removeUnlinkedFolders } from './unlinked-folders';

export const PREPARE_DATA_ARGUMENT = '--prepare-data';

const ROOT = z
  .string()
  .refine(isAbsolute, { message: 'The preparation data root must be absolute.' });

export async function preparationLayout(
  root: string,
  environment: LayoutEnvironment,
): Promise<HubLayout> {
  const absolute = ROOT.parse(root);
  const marker = await readMarker(hubLayout(absolute, environment));
  if (marker?.state === 'moved')
    throw new Error('The Hub data root has moved; use its current location.');
  return layoutFromNames(absolute, marker === undefined ? LEGACY_NAMES : V1_NAMES, environment);
}

interface PreparationOptions {
  readonly files?: DriveFiles;
  readonly location?: Pick<Location, 'rootId' | 'state'>;
  readonly signal?: AbortSignal;
}

async function prepareStore(
  store: Store,
  layout: HubLayout,
  log: Logger,
  options: PreparationOptions,
): Promise<void> {
  const env = {
    store: { ...store, driveBackup: new DriveBackupRepository(store.context) },
    sql: store.context.sql,
    files: options.files ?? nodeFiles,
    log,
    now: store.now,
    purge: { rearm: (): void => undefined },
  };
  const roots = store.driveRoots.list().filter((root) => root.scope === 'person');
  const recovery = await recoverIntents({ ...env, finishCommit: finishCommitFromDisk(env) }, roots);
  if (recovery.failed > 0)
    throw new Error('Drive intents could not be recovered before data preparation.');
  await removeUnlinkedFolders(store.context.sql, layout, log);
  await migratePhotosFolder(env, options.signal);
  assertPhotosFolderPrepared(store.context.sql);
  options.signal?.throwIfAborted();
}

export async function prepareHubData(
  layout: HubLayout,
  log: Logger,
  options: PreparationOptions = {},
): Promise<void> {
  options.signal?.throwIfAborted();
  if (options.location?.state === 'active') await verifyMarker(layout, options.location.rootId);
  await mkdir(dirname(layout.system.database.file), { recursive: true, mode: 0o700 });
  const lock = await lockDataDirectory(layout);
  try {
    const store = openStore({
      path: layout.system.database.file,
      log,
      now: () => new Date(),
      systemTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      drivePathOf: (scope, ownerProfileId) =>
        scope === 'home' ? layout.home.drive : layout.person(String(ownerProfileId)).drive,
    });
    try {
      log.info('service.data_preparation_started');
      await prepareStore(store, layout, log, options);
      log.info('service.data_preparation_finished');
    } finally {
      store.close();
    }
  } finally {
    await lock.release();
  }
}
