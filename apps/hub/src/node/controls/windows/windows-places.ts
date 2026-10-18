import type { FilePlaces } from '@smarteverything/domain';
import { stat } from 'node:fs/promises';
import { orElse, UNREADABLE } from '../linux/fs-fallback';
import { userPlaces } from '../portable/user-places';

type Place = FilePlaces['places'][number];

const LETTERS: readonly string[] = Array.from({ length: 26 }, (_, index) =>
  String.fromCharCode(65 + index),
);

async function drives(): Promise<readonly Place[]> {
  const found = await Promise.all(
    LETTERS.map(async (letter): Promise<Place | null> => {
      const path = `${letter}:\\`;
      const found = await orElse(stat(path), null, UNREADABLE);
      return found === null ? null : { label: `${letter}:`, path, kind: 'drive' };
    }),
  );
  return found.filter((place) => place !== null);
}

export function windowsPlaces(): Promise<FilePlaces> {
  return userPlaces(drives, null);
}
