import type { Logger } from '@smarteverything/logging';
import type { ActivityCursor } from '../../photos/sharing/tail';
import type { Store } from '../../store/store';
import type { AlbumActivityRequest, AlbumPush } from './push-units';
import type { Audience } from './reply-audience';

export function albumAudience(recipients: ReadonlySet<string>, log: Logger): Audience {
  return (client) => {
    if (!recipients.has(client.profileId)) return false;
    const read = client.photos;
    if (read.status === 'invalid') {
      log.warn('photos.album_activity_pref_unreadable', {
        clientId: client.clientId,
        reason: read.reason,
      });
      return true;
    }
    return read.value.albumActivity;
  };
}

export type AlbumDelivery = (push: AlbumPush, accept: Audience) => void;

export function watchAlbumActivity(
  store: Pick<Store, 'now' | 'feed' | 'host'>,
  log: Logger,
  deliver: AlbumDelivery,
): () => void {
  let cursor: ActivityCursor = { at: store.now().toISOString(), handled: [] };
  let turn: Promise<void> = Promise.resolve();
  const drain = (invite: AlbumActivityRequest['invite'], announce: boolean): void => {
    const drained = turn.then(async () => {
      const found = await store.host.read('pushAlbumActivity', { cursor, invite });
      cursor = found.cursor;
      if (!announce) return;
      for (const push of found.pushes) deliver(push, albumAudience(push.recipients, log));
    });
    turn = drained.catch((cause: unknown) => {
      log.error('push.album_activity_failed', cause);
    });
  };
  drain(null, false);
  return store.feed.subscribeNotices((notice) => {
    if (notice.type !== 'photos_activity') return;
    drain(
      notice.kind === 'invited' && notice.profileId !== undefined
        ? { albumId: notice.albumId, profileId: notice.profileId }
        : null,
      true,
    );
  });
}
