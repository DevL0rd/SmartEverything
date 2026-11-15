import { createHash } from 'node:crypto';
import {
  ApiError,
  type DriveItem,
  type PlannerAlarmSound,
  type PlannerResolvedSound,
  type PlannerSleepSound,
  type PlannerSleepSource,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { canRead, itemAccess, albumVisibleTo } from '../drive/access';
import type { Store } from '../store/store';

const PAGE = 500;

const DAY_MS = 86_400_000;

export const DEFAULT_TONE: PlannerResolvedSound = { kind: 'tone', id: 'default' };

export type SoundStore = Pick<Store, 'driveItems' | 'driveAlbums' | 'driveGrants' | 'driveRoots'>;

type AudioItem = Extract<DriveItem, { readonly kind: 'audio' }>;

export type RingSound = PlannerAlarmSound;

function audioFile(item: DriveItem | undefined): AudioItem | undefined {
  return item?.kind === 'audio' ? item : undefined;
}

function pickFrom(
  tracks: readonly AudioItem[],
  sound: Extract<RingSound, { readonly kind: 'playlist' }>,
  ringKey: string,
  dueAt: Date,
): AudioItem | undefined {
  if (tracks.length === 0) {
    return undefined;
  }
  const index = sound.shuffle
    ? createHash('sha256').update(`${ringKey}|${dueAt.toISOString()}`).digest().readUInt32BE(0)
    : Math.floor(dueAt.getTime() / DAY_MS);
  return tracks[index % tracks.length];
}

export class AlarmSounds {
  constructor(
    private readonly store: SoundStore,
    private readonly log: Logger,
  ) {}

  assertUsable(profileId: string, sound: RingSound): void {
    if (sound.kind === 'file') {
      if (audioFile(this.readableItem(profileId, sound.item_id)) === undefined) {
        throw new ApiError('invalid_request', 'The alarm sound must be an audio file.');
      }
    } else if (sound.kind === 'playlist') {
      this.playlistSource(profileId, sound.item_id);
    }
  }

  media(profileId: string, sound: RingSound): readonly string[] {
    if (sound.kind === 'file') {
      const file = audioFile(this.store.driveItems.find(sound.item_id, profileId));
      return file === undefined ? [] : [`${file.id}:${file.etag}`];
    }
    if (sound.kind === 'playlist') {
      return this.tracks(profileId, sound.item_id).map((track) => `${track.id}:${track.etag}`);
    }
    return [];
  }

  resolve(profileId: string, sound: RingSound, ringKey: string, dueAt: Date): PlannerResolvedSound {
    if (sound.kind === 'tone' || sound.kind === 'radio') {
      return sound;
    }
    const file =
      sound.kind === 'file'
        ? audioFile(this.store.driveItems.find(sound.item_id, profileId))
        : pickFrom(this.tracks(profileId, sound.item_id), sound, ringKey, dueAt);
    if (file === undefined) {
      this.log.warn('planner.alarm_sound_unavailable', { ringKey, sound: sound.kind });
      return DEFAULT_TONE;
    }
    return { kind: 'file', item_id: file.id, name: file.name, etag: file.etag };
  }

  sleepSource(profileId: string, sound: PlannerSleepSound): PlannerSleepSource {
    if (sound.kind === 'noise') {
      return sound;
    }
    if (sound.kind === 'radio') {
      return { kind: 'radio', name: sound.name, url: sound.url };
    }
    const tracks =
      sound.kind === 'file'
        ? [audioFile(this.store.driveItems.find(sound.item_id, profileId))].filter(
            (file) => file !== undefined,
          )
        : this.tracks(profileId, sound.item_id);
    const [first, ...rest] = tracks;
    if (first === undefined) {
      throw new ApiError(
        'invalid_request',
        'The chosen Drive sleep sound has no audio file to play.',
      );
    }
    return {
      kind: 'files',
      files: [first, ...rest].map((track) => ({
        item_id: track.id,
        name: track.name,
        etag: track.etag,
      })),
      shuffle: sound.kind === 'playlist' && sound.shuffle,
    };
  }

  private tracks(profileId: string, itemId: string): readonly AudioItem[] {
    const folder = this.store.driveItems.find(itemId, profileId);
    if (folder?.kind === 'folder') {
      return this.folderTracks(profileId, folder);
    }
    const album = this.store.driveAlbums.find(itemId);
    return album === undefined ? [] : this.albumTracks(profileId, album.id);
  }

  private folderTracks(profileId: string, folder: DriveItem): readonly AudioItem[] {
    const found: AudioItem[] = [];
    let after: string | null = null;
    do {
      const window = this.store.driveItems.children({
        rootId: folder.rootId,
        parentId: folder.id,
        after,
        limit: PAGE,
        viewer: profileId,
      });
      for (const entry of window.entries) {
        const file = audioFile(entry.item);
        if (file !== undefined) found.push(file);
      }
      after = window.next;
    } while (after !== null);
    return found;
  }

  private albumTracks(profileId: string, albumId: string): readonly AudioItem[] {
    const found: AudioItem[] = [];
    let after: { readonly position: number; readonly itemId: string } | null = null;
    do {
      const window = this.store.driveAlbums.members(albumId, after, PAGE);
      for (const member of window.members) {
        const file = audioFile(this.store.driveItems.find(member.itemId, profileId));
        if (file !== undefined) found.push(file);
      }
      after = window.next;
    } while (after !== null);
    return found;
  }

  private readableItem(profileId: string, itemId: string): DriveItem | undefined {
    const item = this.store.driveItems.find(itemId, profileId);
    if (item === undefined) {
      return undefined;
    }
    const access = itemAccess(
      this.store,
      { profileId },
      this.store.driveRoots.byId(item.rootId),
      item,
    );
    return canRead(access) ? item : undefined;
  }

  private playlistSource(profileId: string, itemId: string): void {
    const folder = this.readableItem(profileId, itemId);
    if (folder?.kind === 'folder') {
      return;
    }
    const album = this.store.driveAlbums.find(itemId);
    if (album === undefined || !albumVisibleTo({ profileId }, album)) {
      throw new ApiError('invalid_request', 'The playlist must be a folder or album you can open.');
    }
  }
}
