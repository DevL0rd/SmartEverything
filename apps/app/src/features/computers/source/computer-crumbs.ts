import type { FileCrumb, FileLocation, FilePlace } from '../../files';
import { COMPUTER_TRASH_PLACE } from './computer-abilities';
import { isWithin, joinPath, rootOf, segmentsOf } from './computer-path';
import type { ComputerOrigin } from './computer-node';
import { pathOfLocation } from './computer-ops';

const ROOT_LABEL = 'Computer';

export function placeOfPath(path: string): FileLocation {
  const root = rootOf(path);
  return { place: root, folder: path === root ? null : path };
}

export function crumbsOf(
  location: FileLocation,
  places: readonly FilePlace[],
): readonly FileCrumb<ComputerOrigin>[] {
  if (location.place === COMPUTER_TRASH_PLACE) {
    const trash = places.find((place) => place.key === COMPUTER_TRASH_PLACE);
    return [{ key: COMPUTER_TRASH_PLACE, label: trash?.label ?? 'Trash', location }];
  }
  const path = pathOfLocation(location);
  const base = isWithin(path, location.place) ? location.place : rootOf(path);
  const named = places.find((place) => place.key === base);
  const root: FileCrumb<ComputerOrigin> = {
    key: base,
    label: named?.label ?? (base === '/' ? ROOT_LABEL : base),
    location: { place: base, folder: null },
  };
  const rest = segmentsOf(path).slice(segmentsOf(base).length);
  return rest.reduce<readonly FileCrumb<ComputerOrigin>[]>(
    (crumbs, part) => {
      const parent = crumbs.at(-1)?.key ?? base;
      const key = joinPath(parent, part);
      return [...crumbs, { key, label: part, location: { place: base, folder: key } }];
    },
    [root],
  );
}
