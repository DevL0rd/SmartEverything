import type { FilePlaces } from '@smarteverything/domain';
import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { orElse, UNREADABLE } from '../linux/fs-fallback';

type Place = FilePlaces['places'][number];

const USER_FOLDERS: readonly string[] = ['Downloads', 'Desktop', 'Documents'];

async function isFolder(path: string): Promise<boolean> {
  const info = await orElse(stat(path), null, UNREADABLE);
  return info?.isDirectory() === true;
}

export async function userPlaces(
  drives: () => Promise<readonly Place[]>,
  root: Place | null,
  home: string = homedir(),
): Promise<FilePlaces> {
  const candidates = USER_FOLDERS.map((label): Place => ({
    label,
    path: join(home, label),
    kind: 'folder',
  }));
  const found = await Promise.all(
    candidates.map(async (place) => ((await isFolder(place.path)) ? place : null)),
  );
  return {
    home,
    places: [
      { label: 'Home', path: home, kind: 'home' },
      ...found.filter((place) => place !== null),
      ...(root === null ? [] : [root]),
      ...(await drives()),
    ],
  };
}
