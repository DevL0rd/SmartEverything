import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupState, PhotosProgressNotice } from '@smarteverything/domain';
import { ScreenPause, ScreenPausedContext } from '../../../design/screen-pause';

interface Seen {
  faces: number;
  labels: string[];
  readonly listeners: Set<(notice: PhotosProgressNotice) => void>;
}

const seen = vi.hoisted((): Seen => ({
  faces: 0,
  labels: [],
  listeners: new Set(),
}));

const STATE: BackupState = {
  devices: [
    {
      device: {
        id: 'a1b2c3d4-0000-4000-8000-000000000001',
        profileId: 'a1b2c3d4-0000-4000-8000-000000000002',
        deviceId: 'pixel',
        name: 'Pixel 9',
        platform: 'android',
        lastSeenAt: '2026-11-07T10:00:00.000Z',
        settings: {
          enabled: true,
          folders: [],
          wifiOnly: true,
          chargingOnly: false,
          includeVideos: true,
        },
      },
      backedUp: 100,
      pending: 30,
      uploading: 4,
      failed: 0,
      lastBackupAt: '2026-11-07T09:40:00.000Z',
    },
  ],
  bytesLeft: 0,
  targetFolder: 'Photos',
};

vi.mock('../../../design/platform', () => ({ isNative: (): boolean => false }));
vi.mock('../../../components/interactive', () => ({
  Interactive: ({ label }: { readonly label: string }): null => {
    seen.faces += 1;
    seen.labels.push(label);
    return null;
  },
}));
vi.mock('../../../components/charts', () => ({ Arc: (): null => null }));
vi.mock('../../../components/flat-choice', () => ({ FlatChoice: (): null => null }));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/text', () => ({ Text: (): null => null }));
vi.mock('../components/photos-frame', () => ({
  PHOTOS_BACKUP_SETTINGS_HREF: '/settings/photos-backup',
  phoneLeftOf: (): number => 0,
}));
vi.mock('../backup/model/status', () => ({
  useBackupStatus: (): never => {
    throw new Error('The Hub chip never reads the phone backup status');
  },
}));
vi.mock('../data', () => ({
  usePhotoBackupState: (): { readonly data: BackupState } => ({ data: STATE }),
  photoKeys: {
    backup: (): readonly string[] => ['backup'],
    processing: (): readonly string[] => ['processing'],
  },
}));
vi.mock('../../drive', () => ({
  onPhotosProgress: (listener: (notice: PhotosProgressNotice) => void): (() => void) => {
    seen.listeners.add(listener);
    return (): void => {
      seen.listeners.delete(listener);
    };
  },
}));

const { BackupChip } = await import('./backup-chip');
const { startPhotosLiveProgress } = await import('../backup/live');

let root: Root | null = null;
let stop: (() => void) | null = null;
let frames: (() => void)[] = [];

function send(patch: Partial<PhotosProgressNotice>): void {
  const notice: PhotosProgressNotice = {
    type: 'photos_progress',
    kind: 'backup',
    done: 0,
    total: 0,
    ...patch,
  };
  act(() => {
    for (const listener of seen.listeners) listener(notice);
  });
}

function mount(pause: ScreenPause): void {
  const client = new QueryClient();
  stop = startPhotosLiveProgress(client);
  const created = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  root = created;
  act(() => {
    created.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(ScreenPausedContext, { value: pause }, createElement(BackupChip)),
      ),
    );
  });
}

beforeEach(() => {
  seen.faces = 0;
  seen.labels = [];
  frames = [];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
    frames.push(callback);
    return frames.length;
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  stop?.();
  stop = null;
  vi.unstubAllGlobals();
});

describe('the Hub backup chip', () => {
  it('does not render again for preview processing notices', () => {
    mount(new ScreenPause(null));
    const first = seen.faces;
    for (let done = 1; done <= 50; done += 1) send({ kind: 'preview', done, total: 3_900 });
    expect(seen.faces).toBe(first);
  });

  it('renders once for a change in a device backup count', () => {
    mount(new ScreenPause(null));
    const first = seen.faces;
    send({ deviceId: 'pixel', done: 120, total: 134 });
    expect(seen.faces).toBe(first + 1);
    expect(seen.labels.at(-1)).toBe('Backup: Backing up 14');
    send({ deviceId: 'pixel', done: 120, total: 134 });
    expect(seen.faces).toBe(first + 1);
  });

  it('holds device progress while its screen is paused and catches up once on resume', () => {
    const pause = new ScreenPause(null);
    pause.attach();
    mount(pause);
    act(() => {
      pause.setOwn(true);
    });
    const first = seen.faces;
    for (let done = 101; done <= 130; done += 1) send({ deviceId: 'pixel', done, total: 134 });
    expect(seen.faces).toBe(first);
    act(() => {
      pause.setOwn(false);
    });
    act(() => {
      for (const frame of frames.splice(0)) frame();
    });
    expect(seen.faces).toBe(first + 1);
    expect(seen.labels.at(-1)).toBe('Backup: Backing up 4');
  });
});
