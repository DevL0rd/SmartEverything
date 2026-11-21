import type {
  DriveItem,
  NativeHubResourceRestored,
  PhotoFolderOrigin,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import {
  canRestoreMedia,
  restoreMediaFile,
  revealRestoredMedia,
  type MediaRestore,
} from '../../../api/connection/media-resources';
import { readDriveItem } from '../../../api/drive';
import { readPhotoOrigins } from '../../../api/photos';
import { notify, notifyFailure } from '../../../components/toast-store';
import { appPlatform } from '../../../design/platform';
import { rawErrorText } from '../../../format/errors';
import { saveFile } from '../../../platform/file-actions';
import { runBulk } from '../../../store/bulk-run';
import { driveLinks } from '../../drive';
import { backupHandle } from '../backup/handle';
import {
  doneLine,
  failedLine,
  saveTargetOf,
  type SavePlatform,
  type SaveTally,
} from './save-target';

const log = new Logger('app.photos');

type MediaFile = Extract<DriveItem, { readonly kind: 'image' | 'video' }>;

export interface SaveDeps {
  readonly platform: () => SavePlatform | null;
  readonly deviceId: () => string | null;
  readonly read: (itemId: string) => Promise<DriveItem>;
  readonly origins: (
    deviceId: string,
    itemIds: readonly string[],
  ) => Promise<ReadonlyMap<string, PhotoFolderOrigin>>;
  readonly fileUrl: (item: DriveItem) => Promise<string | null>;
  readonly restore: (url: string, request: MediaRestore) => Promise<NativeHubResourceRestored>;
  readonly browserSave: (url: string) => Promise<unknown>;
  readonly reveal: (location: string) => Promise<void>;
}

function livePlatform(): SavePlatform | null {
  if (!canRestoreMedia()) return null;
  const platform = appPlatform();
  return platform === 'web' ? null : platform;
}

async function liveOrigins(
  deviceId: string,
  itemIds: readonly string[],
): Promise<ReadonlyMap<string, PhotoFolderOrigin>> {
  const answer = await readPhotoOrigins({ deviceId, itemIds });
  const found = new Map<string, PhotoFolderOrigin>();
  for (const entry of answer.origins)
    if (entry.folder !== null) found.set(entry.itemId, entry.folder);
  return found;
}

const LIVE: SaveDeps = {
  platform: livePlatform,
  deviceId: () => {
    const handle = backupHandle.get();
    return handle === null ? null : handle.deviceId;
  },
  read: (itemId) => readDriveItem(itemId),
  origins: liveOrigins,
  fileUrl: (item) => driveLinks.resolve(item.id, item.rev, 'file'),
  restore: restoreMediaFile,
  browserSave: saveFile,
  reveal: revealRestoredMedia,
};

function mediaOf(item: DriveItem): MediaFile {
  if (item.kind !== 'image' && item.kind !== 'video')
    throw new Error(`${item.name} is not a photo or video`);
  return item;
}

interface Plan {
  readonly platform: SavePlatform;
  readonly origins: ReadonlyMap<string, PhotoFolderOrigin>;
}

async function saveOne(
  item: MediaFile,
  plan: Plan,
  deps: SaveDeps,
): Promise<NativeHubResourceRestored> {
  const url = await deps.fileUrl(item);
  if (url === null) throw new Error(`The hub gave no link for ${item.name}`);
  const origin = plan.origins.get(item.id) ?? null;
  const target = saveTargetOf(plan.platform, origin, item.mime);
  if (origin !== null && target.kind === 'restored')
    log.info('photos.save_origin_outside_gallery', { kind: item.kind });
  return deps.restore(url, {
    name: item.name,
    mimeType: item.mime,
    sha256: item.sha256,
    takenAt: item.takenAt === null ? null : Date.parse(item.takenAt),
    target,
  });
}

async function originsFor(
  items: readonly MediaFile[],
  deps: SaveDeps,
): Promise<ReadonlyMap<string, PhotoFolderOrigin>> {
  const deviceId = deps.deviceId();
  if (deviceId === null) {
    log.info('photos.save_without_backup_device', { count: items.length });
    return new Map();
  }
  return deps.origins(
    deviceId,
    items.map((item) => item.id),
  );
}

function announce(tally: SaveTally, last: string | null, deps: SaveDeps): void {
  if (tally.failed > 0 && tally.saved + tally.present === 0) return;
  notify({
    message: doneLine(tally),
    tone: 'positive',
    ...(last === null
      ? {}
      : {
          action: {
            label: 'Open',
            onPress: (): void => {
              deps.reveal(last).catch(notifyFailure('The saved photos could not be opened'));
            },
          },
        }),
  });
}

async function saveAll(items: readonly MediaFile[], plan: Plan, deps: SaveDeps): Promise<void> {
  const tally = { saved: 0, present: 0, failed: 0 };
  let last: string | null = null;
  let firstError: unknown = null;
  const byId = new Map(items.map((item) => [item.id, item]));
  await runBulk({
    label: 'photos.save_to_device',
    verb: 'Saving',
    ids: items.map((item) => item.id),
    batch: 1,
    send: async (batch) => {
      const failed: { readonly itemId: string; readonly reason: string }[] = [];
      for (const id of batch) {
        const item = byId.get(id);
        if (item === undefined) throw new Error(`No photo ${id} to save`);
        try {
          const result = await saveOne(item, plan, deps);
          tally[result.result === 'saved' ? 'saved' : 'present'] += 1;
          last = result.location;
        } catch (error) {
          tally.failed += 1;
          if (firstError === null) firstError = error;
          failed.push({ itemId: id, reason: rawErrorText(error) });
        }
      }
      return { failed };
    },
  });
  log.info('photos.saved_to_device', { ...tally, platform: plan.platform });
  announce(tally, last, deps);
  if (tally.failed > 0)
    notify({ message: failedLine(tally.failed), error: firstError, tone: 'critical' });
}

async function browserDownload(items: readonly MediaFile[], deps: SaveDeps): Promise<void> {
  log.info('photos.save_by_browser', { count: items.length });
  for (const item of items) {
    const url = await deps.fileUrl(item);
    if (url === null) throw new Error(`The hub gave no link for ${item.name}`);
    await deps.browserSave(url);
  }
}

export async function saveToDevice(
  itemIds: readonly string[],
  deps: SaveDeps = LIVE,
): Promise<void> {
  if (itemIds.length === 0) return;
  try {
    const items = (await Promise.all(itemIds.map(deps.read))).map(mediaOf);
    const platform = deps.platform();
    if (platform === null) {
      await browserDownload(items, deps);
      return;
    }
    await saveAll(items, { platform, origins: await originsFor(items, deps) }, deps);
  } catch (error) {
    notify({ message: failedLine(itemIds.length), error, tone: 'critical' });
  }
}
