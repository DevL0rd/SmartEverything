import type { FilePlaces } from '@smarteverything/domain';
import type { FilePlace } from '../../files';
import { COMPUTER_TRASH_PLACE } from './computer-abilities';
import { normalPath } from './computer-path';

type ServerPlace = FilePlaces['places'][number];

const TRASH_LOCATION = { place: COMPUTER_TRASH_PLACE, folder: null } as const;

function placeOf(place: ServerPlace): FilePlace {
  if (place.kind === 'trash') {
    return {
      key: COMPUTER_TRASH_PLACE,
      label: place.label,
      kind: 'trash',
      location: TRASH_LOCATION,
    };
  }
  const key = normalPath(place.path);
  return {
    key,
    label: place.label,
    kind: place.kind === 'drive' ? 'volume' : place.kind,
    location: { place: key, folder: null },
  };
}

export function placesOfData(places: FilePlaces | undefined): readonly FilePlace[] {
  if (places === undefined) return [];
  const listed = places.places.map(placeOf);
  const needsTrash =
    places.abilities.includes('trash') && !listed.some((place) => place.kind === 'trash');
  return needsTrash
    ? [
        ...listed,
        { key: COMPUTER_TRASH_PLACE, label: 'Trash', kind: 'trash', location: TRASH_LOCATION },
      ]
    : listed;
}
