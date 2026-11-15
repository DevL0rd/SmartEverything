import { API_ENDPOINTS as E, type DriveItem } from '@smarteverything/domain';
import type { HubApi } from './api.ts';
import { dayKey, daysAgo } from './clock.ts';
import type { Counted, SeedContext } from './context.ts';
import { childrenOf, itemAt, rootsOf } from './drive-api.ts';

async function cameraPhotos(api: HubApi, rootId: string): Promise<DriveItem[]> {
  const photos: DriveItem[] = [];
  const camera = await itemAt(api, rootId, 'Photos/Camera');
  for (const year of await childrenOf(api, rootId, camera.id)) {
    if (year.kind !== 'folder') continue;
    for (const month of await childrenOf(api, rootId, year.id)) {
      if (month.kind !== 'folder') continue;
      photos.push(
        ...(await childrenOf(api, rootId, month.id)).filter((item) => item.kind === 'image'),
      );
    }
  }
  return photos;
}

export async function seedPhotosApi(context: SeedContext): Promise<Counted> {
  const { api, anchor } = context;
  const owner = context.people[0];
  const member = context.people[1];
  if (owner === undefined || member === undefined) throw new Error('The household is incomplete.');
  const root = (await rootsOf(api)).find(
    (candidate) => candidate.scope === 'person' && candidate.ownerProfileId === owner.id,
  );
  if (root === undefined) throw new Error('The owner has no drive.');
  const photos = await cameraPhotos(api, root.id);
  const pick = (start: number, step: number, count: number): string[] =>
    Array.from({ length: count }, (_, index) => photos[start + index * step]?.id).filter(
      (id): id is string => id !== undefined,
    );
  const favourites = pick(0, 11, 18);
  await api.call(E.changeDrive, { body: { action: 'star', itemIds: favourites } });
  const albums: Record<string, string[]> = {
    Favourites: favourites.slice(0, 12),
    Trips: pick(3, 7, 24),
    Family: pick(5, 13, 10),
  };
  let created = 0;
  let family: string | undefined;
  for (const [title, itemIds] of Object.entries(albums)) {
    const album = await api.call(E.createAlbum, {
      body: { kind: 'manual', title, surface: 'photos', scope: 'person', itemIds },
    });
    created += 1;
    if (title === 'Family') family = album.id;
  }
  if (family !== undefined)
    await api.call(E.setPhotoAlbumMembers, {
      params: { albumId: family },
      body: { members: [{ profileId: member.id, role: 'contributor' }] },
    });
  await api.call(E.setPhotoPartner, {
    body: {
      recipientId: member.id,
      scope: 'all',
      groupIds: [],
      fromDay: dayKey(daysAgo(anchor, 365)),
    },
  });
  await api.call(E.archivePhotos, { body: { itemIds: pick(2, 17, 4) } });
  return { favourites: favourites.length, albums: created, partners: 1, archived: 4 };
}
