import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import type { FilePlaces } from '@smarteverything/domain';
import { FlatChoice } from '../../../components/flat-choice';
import type { IconName } from '../../../components/icon';

type Place = FilePlaces['places'][number];

const ICONS: Readonly<Record<Place['kind'], IconName>> = {
  home: 'house',
  root: 'monitor',
  folder: 'folder',
  drive: 'server',
};

function PlaceChip({
  place,
  here,
  onGo,
}: {
  readonly place: Place;
  readonly here: boolean;
  readonly onGo: (path: string) => void;
}): ReactNode {
  return (
    <FlatChoice
      label={place.label}
      spoken={`Go to ${place.label}`}
      active={here}
      icon={ICONS[place.kind]}
      onPress={() => {
        onGo(place.path);
      }}
    />
  );
}

export function PlacesBar({
  places,
  here,
  onGo,
}: {
  readonly places: FilePlaces;
  readonly here: string;
  readonly onGo: (path: string) => void;
}): ReactNode {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0">
      <View className="flex-row items-center px-1">
        {places.places.map((place) => (
          <PlaceChip key={place.path} place={place} here={place.path === here} onGo={onGo} />
        ))}
      </View>
    </ScrollView>
  );
}
