import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { MediaInfo, MediaState } from '@smarteverything/domain';
import { receivePhotosProgress } from '../../nas/data/live';
import { photoKeys } from '../data/keys';
import {
  ViewerVideo,
  followPlayable,
  playableProgressOf,
  playableShare,
  videoLookOf,
  type PlayableProgress,
} from './video-player';

const ITEM = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000a2';

function mediaWith(playable: MediaState): MediaInfo {
  return {
    itemId: ITEM,
    timeSource: null,
    tzOffsetMin: null,
    motionClipId: null,
    liveId: null,
    burstId: null,
    stackId: null,
    placeId: null,
    preview: { state: 'ready' },
    poster: { state: 'ready' },
    playable,
  };
}

describe('viewer video', () => {
  it('loads the component the stage shows', () => {
    expect(typeof ViewerVideo).toBe('function');
  });

  it('plays only a ready copy with a link on a runtime that has the player', () => {
    const ready = mediaWith({ state: 'ready' });
    expect(videoLookOf(true, ready, 'https://hub/playable')).toBe('ready');
    expect(videoLookOf(true, ready, null)).toBe('waiting');
    expect(videoLookOf(true, null, 'https://hub/playable')).toBe('waiting');
    expect(videoLookOf(false, ready, 'https://hub/playable')).toBe('unavailable');
  });

  it('shows Preparing while the hub converts and the failure when it cannot', () => {
    expect(videoLookOf(true, mediaWith({ state: 'none' }), null)).toBe('preparing');
    expect(videoLookOf(true, mediaWith({ state: 'processing' }), null)).toBe('preparing');
    const failed = mediaWith({ state: 'failed', reason: 'ffmpeg exited 1' });
    expect(videoLookOf(true, failed, null)).toBe('failed');
    const unsupported = mediaWith({ state: 'unsupported', reason: 'no video stream' });
    expect(videoLookOf(true, unsupported, null)).toBe('failed');
  });

  it('follows only the playable progress of this item', () => {
    const notice = {
      type: 'photos_progress',
      kind: 'playable',
      itemId: ITEM,
      done: 3,
      total: 8,
    } as const;
    expect(playableProgressOf(notice, ITEM)).toEqual({ done: 3, total: 8 });
    expect(playableProgressOf(notice, OTHER)).toBeNull();
    expect(playableProgressOf({ ...notice, kind: 'preview' }, ITEM)).toBeNull();
    expect(
      playableProgressOf({ type: 'photos_progress', kind: 'playable', done: 1, total: 1 }, ITEM),
    ).toBeNull();
    expect(playableShare({ done: 3, total: 8 })).toBe(0.375);
    expect(playableShare({ done: 0, total: 0 })).toBe(0);
    expect(playableShare(null)).toBe(0);
  });

  it('reloads each completed video while other videos remain pending and stops when released', () => {
    const client = new QueryClient();
    client.setQueryData(photoKeys.media(ITEM), mediaWith({ state: 'processing' }));
    const heard: PlayableProgress[] = [];
    const stale = (): boolean =>
      client.getQueryState(photoKeys.media(ITEM))?.isInvalidated === true;
    const release = followPlayable(client, ITEM, (at) => {
      heard.push(at);
    });
    const playable = { type: 'photos_progress', kind: 'playable' } as const;
    receivePhotosProgress({ ...playable, itemId: ITEM, done: 2, total: 5 });
    receivePhotosProgress({ ...playable, itemId: OTHER, done: 5, total: 5 });
    expect(stale()).toBe(true);
    client.setQueryData(photoKeys.media(ITEM), mediaWith({ state: 'ready' }));
    receivePhotosProgress({ ...playable, itemId: ITEM, done: 5, total: 5 });
    expect(stale()).toBe(true);
    release();
    receivePhotosProgress({ ...playable, itemId: ITEM, done: 1, total: 5 });
    expect(heard).toStrictEqual([
      { done: 2, total: 5 },
      { done: 5, total: 5 },
    ]);
  });
});
