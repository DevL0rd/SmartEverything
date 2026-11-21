import type { AlbumActivity, AlbumActivityCreate } from '@smarteverything/domain';
import { randomUUID } from 'expo-crypto';
import { showTargets } from '../../../queries/shown-query';
import { useShownWriter, type ShownWriter } from '../../../queries/shown-writer';
import { addAlbumActivity } from './api';
import { invalidateAlbumActivity } from './queries';
import { addedTargets, savedTarget } from './shown';

export function shownActivity(
  albumId: string,
  profileId: string,
  body: AlbumActivityCreate & { readonly id: string },
  now: string,
): AlbumActivity {
  return {
    id: body.id,
    albumId,
    itemId: body.itemId ?? null,
    profileId,
    kind: body.kind,
    text: body.kind === 'comment' ? body.text : null,
    createdAt: now,
  };
}

export interface ActivityWriter {
  readonly busy: boolean;
  readonly write: ShownWriter;
  readonly add: (
    me: string | null,
    body: AlbumActivityCreate,
    failure: string,
    refused?: () => void,
  ) => void;
}

export function useActivityWriter(albumId: string): ActivityWriter {
  const { busy, write, client } = useShownWriter((settled) => {
    invalidateAlbumActivity(settled, albumId);
  });
  const add: ActivityWriter['add'] = (me, request, failure, refused) => {
    const body = { ...request, id: randomUUID() };
    const entry = me === null ? null : shownActivity(albumId, me, body, new Date().toISOString());
    write({
      event: `photos.album_activity.${body.kind}`,
      targets: entry === null ? [] : addedTargets(entry),
      send: async () => {
        try {
          return await addAlbumActivity(albumId, body);
        } catch (error) {
          refused?.();
          throw error;
        }
      },
      failure,
      saved: (saved) => {
        if (entry !== null) showTargets(client, [savedTarget(entry.id, saved)]);
      },
    });
  };
  return { busy, write, add };
}
