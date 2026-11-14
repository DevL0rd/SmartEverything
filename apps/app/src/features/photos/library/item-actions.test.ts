import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRIVE_ITEM, type DriveItem } from '@smarteverything/domain';
import type { ToastInput } from '../../../components/toast-store';
import type { PickedFile } from '../../../platform/pick-files';

const notify = vi.hoisted(() => vi.fn<(input: ToastInput) => number>());

vi.mock('../../../components/toast-store', () => ({ notify }));
vi.mock('../../../api/drive', () => ({
  createDriveAlbum: vi.fn(),
  createDriveShare: vi.fn(),
  readDriveItem: vi.fn(),
  readDriveLinks: vi.fn(),
}));
vi.mock('../../assistant', () => ({ attachFiles: vi.fn(), useLastChat: vi.fn() }));
vi.mock('expo-router', () => ({ router: { push: vi.fn(), navigate: vi.fn() } }));

import { askAbout, downloadItems, sendToChat, type ItemDeps } from './item-actions';

const ROOT = '00000000-0000-4000-8000-0000000000b1';
const CHAT = 'chat-1';

function item(id: string, kind: 'image' | 'document', name: string): DriveItem {
  return DRIVE_ITEM.parse({
    id,
    rootId: ROOT,
    parentId: null,
    relPath: `Photos/${name}`,
    name,
    modifiedAt: '2026-11-07T10:42:18.000Z',
    addedAt: '2026-11-07T10:42:18.000Z',
    openedAt: null,
    starred: false,
    shared: false,
    rev: 1,
    etag: 'e1',
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
    mime: kind === 'image' ? 'image/jpeg' : 'application/pdf',
    bytes: 2048,
    sha256: null,
    integrity: 'ok',
    thumb: { state: 'ready' },
    ...(kind === 'image'
      ? {
          takenAt: '2026-11-07T10:42:18.000Z',
          width: 4032,
          height: 3024,
          orientation: 1,
          camera: null,
          exposure: null,
          place: null,
        }
      : {}),
    kind,
  });
}

const PHOTO = item('00000000-0000-4000-8000-0000000000a1', 'image', 'Garden.jpg');
const SECOND = item('00000000-0000-4000-8000-0000000000a2', 'image', 'Harbour.jpg');
const PDF = item('00000000-0000-4000-8000-0000000000a3', 'document', 'Notes.pdf');

interface Fake extends ItemDeps {
  readonly attached: (readonly PickedFile[])[];
  readonly saved: string[];
  readonly opened: string[];
}

function fake(
  items: readonly DriveItem[],
  urls: Readonly<Record<string, string | null>> = {},
): Fake {
  const attached: (readonly PickedFile[])[] = [];
  const saved: string[] = [];
  const opened: string[] = [];
  return {
    attached,
    saved,
    opened,
    read: (itemId): Promise<DriveItem> => {
      const found = items.find((entry) => entry.id === itemId);
      return found === undefined ? Promise.reject(new Error('gone')) : Promise.resolve(found);
    },
    attach: (files): void => {
      attached.push(files);
    },
    fileUrl: (entry): Promise<string | null> =>
      Promise.resolve(entry.id in urls ? (urls[entry.id] ?? null) : `u/${entry.name}`),
    save: (url, name): void => {
      saved.push(`${name}=${url}`);
    },
    openChat: (chatId): void => {
      opened.push(chatId);
    },
  };
}

describe('library item actions', () => {
  beforeEach(() => {
    notify.mockReset();
  });

  it('attaches the originals of every picked photo to the open chat', async () => {
    const deps = fake([PHOTO, SECOND]);
    await expect(sendToChat([PHOTO.id, SECOND.id], CHAT, deps)).resolves.toBe(2);
    expect(deps.attached[0]?.map((file) => file.name)).toEqual(['Garden.jpg', 'Harbour.jpg']);
    const toast = notify.mock.calls[0]?.[0];
    expect(toast?.message).toBe('2 files added to the message field');
    toast?.action?.onPress();
    expect(deps.opened).toEqual([CHAT]);
  });

  it('skips items that are not photos or videos', async () => {
    const deps = fake([PDF]);
    await expect(sendToChat([PDF.id], CHAT, deps)).resolves.toBe(0);
    expect(deps.attached).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
  });

  it('reports an item it could not read and attaches nothing', async () => {
    const deps = fake([]);
    await expect(sendToChat([PHOTO.id], CHAT, deps)).resolves.toBe(0);
    expect(deps.attached).toEqual([]);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Could not add to the chat', tone: 'critical' }),
    );
  });

  it('asks about a photo by attaching its original and opening the chat', async () => {
    const deps = fake([PHOTO]);
    await expect(askAbout(PHOTO.id, CHAT, deps)).resolves.toBe(true);
    expect(deps.attached[0]?.map((file) => file.name)).toEqual(['Garden.jpg']);
    expect(deps.opened).toEqual([CHAT]);
    expect(notify).not.toHaveBeenCalled();
  });

  it('does not open the chat to ask about a file that is not a photo or video', async () => {
    const deps = fake([PDF]);
    await expect(askAbout(PDF.id, CHAT, deps)).resolves.toBe(false);
    expect(deps.attached).toEqual([]);
    expect(deps.opened).toEqual([]);
  });

  it('reports a photo it could not read when asking about it', async () => {
    const deps = fake([]);
    await expect(askAbout(PHOTO.id, CHAT, deps)).resolves.toBe(false);
    expect(deps.opened).toEqual([]);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Could not ask about it in the chat', tone: 'critical' }),
    );
  });

  it('downloads every original and names the ones that failed', async () => {
    const deps = fake([PHOTO, SECOND], { [SECOND.id]: null });
    await downloadItems([PHOTO.id, SECOND.id], deps);
    expect(deps.saved).toEqual(['Garden.jpg=u/Garden.jpg']);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'A photo could not be downloaded', tone: 'critical' }),
    );
  });
});
