import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DriveItem,
  NativeHubResourceRestored,
  PhotoFolderOrigin,
} from '@smarteverything/domain';
import { driveItemFixture } from '../../drive/testing';
import type { ToastInput } from '../../../components/toast-store';
import type { MediaRestore } from '../../../api/connection/media-resources';

const toast = vi.hoisted(() => ({
  notify: vi.fn<(input: ToastInput) => number>(() => 7),
  updateToast: vi.fn(),
  holdToast: vi.fn(),
  dismissToast: vi.fn(),
  notifyFailure: vi.fn(() => vi.fn()),
}));

vi.mock('../../../components/toast-store', () => toast);
vi.mock('../../../api/drive', () => ({ readDriveItem: vi.fn() }));
vi.mock('../../../api/photos', () => ({ readPhotoOrigins: vi.fn() }));
vi.mock('../../../api/connection/media-resources', () => ({
  canRestoreMedia: vi.fn(),
  restoreMediaFile: vi.fn(),
  revealRestoredMedia: vi.fn(),
}));
vi.mock('../../../platform/file-actions', () => ({ saveFile: vi.fn() }));
vi.mock('../../drive', () => ({ driveLinks: { resolve: vi.fn() } }));
vi.mock('../backup/handle', () => ({ backupHandle: { get: vi.fn() } }));

import { saveToDevice, type SaveDeps } from './save-to-device';
import { saveTargetOf, type SavePlatform } from './save-target';

const ROOT = '00000000-0000-4000-8000-0000000000b1';

function photo(id: string, name: string, kind: 'image' | 'video' = 'image'): DriveItem {
  return driveItemFixture(kind, {
    id,
    rootId: ROOT,
    parentId: null,
    relPath: `Photos/${name}`,
    name,
    modifiedAt: '2026-11-07T10:42:18.000Z',
    addedAt: '2026-11-07T10:42:18.000Z',
    etag: 'e1',
    mime: kind === 'image' ? 'image/jpeg' : 'video/mp4',
    bytes: 2048,
    integrity: 'ok',
    sha256: 'c'.repeat(64),
    thumb: { state: 'ready' },
    takenAt: '2024-06-01T10:20:30.000Z',
  });
}

const CAMERA = photo('00000000-0000-4000-8000-0000000000a1', 'IMG_1.jpg');
const SHARED = photo('00000000-0000-4000-8000-0000000000a2', 'From Sam.jpg');
const CLIP = photo('00000000-0000-4000-8000-0000000000a3', 'clip.mp4', 'video');
const ORIGIN: PhotoFolderOrigin = { key: 'phone:DCIM/Camera', name: 'Camera' };

interface Fake extends SaveDeps {
  readonly restored: { readonly url: string; readonly request: MediaRestore }[];
  readonly browser: string[];
  readonly revealed: string[];
}

function fake(
  items: readonly DriveItem[],
  options: {
    readonly platform?: SavePlatform | null;
    readonly deviceId?: string | null;
    readonly results?: Readonly<Record<string, NativeHubResourceRestored | Error>>;
  } = {},
): Fake {
  const restored: Fake['restored'] = [];
  const browser: string[] = [];
  const revealed: string[] = [];
  return {
    restored,
    browser,
    revealed,
    platform: () => (options.platform === undefined ? 'android' : options.platform),
    deviceId: () => (options.deviceId === undefined ? 'phone-1' : options.deviceId),
    read: (itemId): Promise<DriveItem> => {
      const found = items.find((entry) => entry.id === itemId);
      return found === undefined ? Promise.reject(new Error('gone')) : Promise.resolve(found);
    },
    origins: () => Promise.resolve(new Map([[CAMERA.id, ORIGIN]])),
    fileUrl: (entry) => Promise.resolve(`u/${entry.name}`),
    restore: (url, request): Promise<NativeHubResourceRestored> => {
      restored.push({ url, request });
      const result = options.results?.[request.name];
      if (result instanceof Error) return Promise.reject(result);
      return Promise.resolve(result ?? { result: 'saved', location: `content://${request.name}` });
    },
    browserSave: (url): Promise<unknown> => {
      browser.push(url);
      return Promise.resolve('completed');
    },
    reveal: (location): Promise<void> => {
      revealed.push(location);
      return Promise.resolve();
    },
  };
}

function lastNotice(): ToastInput | undefined {
  return toast.notify.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('choosing where a photo goes back to', () => {
  it('sends photos from this device home and the rest to Restored', () => {
    expect(saveTargetOf('android', ORIGIN, 'image/jpeg')).toEqual({
      kind: 'origin',
      folder: 'DCIM/Camera',
    });
    expect(saveTargetOf('android', null, 'image/jpeg')).toEqual({ kind: 'restored' });
    expect(
      saveTargetOf('desktop', { key: 'computer:/home/a/Pictures/Trip', name: 'Trip' }, 'video/mp4'),
    ).toEqual({ kind: 'origin', folder: '/home/a/Pictures/Trip' });
  });

  it('uses Restored for an album Android keeps out of the gallery', () => {
    const app = { key: 'phone:Android/media/com.app/Pictures', name: 'Pictures' };
    expect(saveTargetOf('android', app, 'image/jpeg')).toEqual({ kind: 'restored' });
    const movies = { key: 'phone:Movies/Clips', name: 'Clips' };
    expect(saveTargetOf('android', movies, 'image/jpeg')).toEqual({ kind: 'restored' });
    expect(saveTargetOf('android', movies, 'video/mp4')).toEqual({
      kind: 'origin',
      folder: 'Movies/Clips',
    });
  });

  it('refuses an origin from another kind of device', () => {
    expect(() => saveTargetOf('desktop', ORIGIN, 'image/jpeg')).toThrow(/not a folder/);
  });
});

describe('saving photos to this device', () => {
  it('saves each one with its name, hash and taken time, with progress and an Open notice', async () => {
    const deps = fake([CAMERA, SHARED]);
    await saveToDevice([CAMERA.id, SHARED.id], deps);
    expect(deps.restored.slice(0, 1)).toEqual([
      {
        url: 'u/IMG_1.jpg',
        request: {
          name: 'IMG_1.jpg',
          mimeType: 'image/jpeg',
          sha256: 'c'.repeat(64),
          takenAt: Date.parse('2024-06-01T10:20:30.000Z'),
          target: { kind: 'origin', folder: 'DCIM/Camera' },
        },
      },
    ]);
    expect(deps.restored[1]?.request.target).toEqual({ kind: 'restored' });
    expect(toast.notify.mock.calls[0]?.[0]).toMatchObject({ message: 'Saving 1 of 2' });
    expect(toast.holdToast).toHaveBeenCalledWith(7, 'work');
    expect(toast.updateToast).toHaveBeenLastCalledWith(7, { message: 'Saving 2 of 2' });
    expect(toast.dismissToast).toHaveBeenCalledWith(7);
    const done = lastNotice();
    expect(done).toMatchObject({ message: 'Saved 2 photos', tone: 'positive' });
    done?.action?.onPress();
    expect(deps.revealed).toEqual(['content://From Sam.jpg']);
  });

  it('reports an identical file already there instead of a new copy', async () => {
    const deps = fake([CAMERA, CLIP], {
      results: { 'IMG_1.jpg': { result: 'present', location: 'content://old' } },
    });
    await saveToDevice([CAMERA.id, CLIP.id], deps);
    expect(lastNotice()).toMatchObject({ message: 'Saved 1 photo · 1 already on this device' });
    const single = fake([CAMERA], {
      results: { 'IMG_1.jpg': { result: 'present', location: 'content://old' } },
    });
    await saveToDevice([CAMERA.id], single);
    expect(lastNotice()).toMatchObject({ message: 'Already on this device' });
  });

  it('sends everything to Restored when this device does not back up', async () => {
    const deps = fake([CAMERA], { deviceId: null });
    await saveToDevice([CAMERA.id], deps);
    expect(deps.restored[0]?.request.target).toEqual({ kind: 'restored' });
  });

  it('names the ones that failed and keeps the ones that saved', async () => {
    const deps = fake([CAMERA, SHARED], { results: { 'From Sam.jpg': new Error('disk full') } });
    await saveToDevice([CAMERA.id, SHARED.id], deps);
    const messages = toast.notify.mock.calls.map(([input]) => input.message);
    expect(messages).toContain('Saved 1 photo');
    expect(lastNotice()).toMatchObject({
      message: 'A photo could not be saved to this device',
      tone: 'critical',
    });
  });

  it('lets a plain browser download the originals', async () => {
    const deps = fake([CAMERA, SHARED], { platform: null });
    await saveToDevice([CAMERA.id, SHARED.id], deps);
    expect(deps.browser).toEqual(['u/IMG_1.jpg', 'u/From Sam.jpg']);
    expect(deps.restored).toEqual([]);
  });
});
