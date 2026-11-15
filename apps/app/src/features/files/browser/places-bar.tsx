import type { ReactNode } from 'react';
import { FilterChip } from '../../../components/filter-chip';
import type { IconName } from '../../../components/icon';
import { ChipRow } from '../../../components/library-frame';
import type { FilePlaceKind } from '../source/types';
import type { FileBrowserHandle } from './browser-types';

const PLACE_ICON: Readonly<Record<FilePlaceKind, IconName>> = {
  my_drive: 'hardDrive',
  shared_drive: 'users',
  shared_with_me: 'share',
  home: 'home',
  root: 'monitor',
  folder: 'folder',
  volume: 'hardDrive',
  trash: 'trash',
};

export function placesShown<O>(browser: FileBrowserHandle<O>): boolean {
  if (browser.host.placesInFrame === true) return false;
  return browser.abilities.places && browser.places.length > 1;
}

export function PlacesBar<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  if (!placesShown(browser)) return null;
  return (
    <ChipRow label="Places">
      {browser.places.map((place) => (
        <FilterChip
          key={place.key}
          label="Place"
          value={place.label}
          icon={PLACE_ICON[place.kind]}
          active={place.key === browser.location.place}
          singleChoice
          onPress={() => {
            browser.commands.openLocation(place.location);
          }}
        />
      ))}
    </ChipRow>
  );
}
