import type { FilePlaces } from '@smarteverything/domain';
import { readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { orElse, UNREADABLE } from '../linux/fs-fallback';
import { userPlaces } from '../portable/user-places';

type Place = FilePlaces['places'][number];

const VOLUMES = '/Volumes';

async function drives(): Promise<readonly Place[]> {
  const names = await orElse(readdir(VOLUMES), [], UNREADABLE);
  const found = await Promise.all(
    names.map(async (name): Promise<Place | null> => {
      const path = join(VOLUMES, name);
      const target = await orElse(realpath(path), null, UNREADABLE);
      return target === null || target === '/' ? null : { label: name, path, kind: 'drive' };
    }),
  );
  return found.filter((place) => place !== null);
}

export function darwinPlaces(): Promise<FilePlaces> {
  return userPlaces(drives, { label: 'Computer', path: '/', kind: 'root' });
}
