import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import type { FilePlaces } from '@smarteverything/domain';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';

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
    <Interactive
      label={`Go to ${place.label}`}
      selected={here}
      onPress={() => {
        onGo(place.path);
      }}
      className={cn(
        'min-h-touch-min flex-row items-center gap-1.5 rounded-full border-hairline px-3',
        here ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-1',
      )}
      layerClassName="rounded-full"
    >
      <Icon name={ICONS[place.kind]} size={16} tone={here ? 'primary' : 'variant'} />
      <Text variant="label" tone={here ? 'primary' : 'default'} numberOfLines={1}>
        {place.label}
      </Text>
    </Interactive>
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
      <View className="flex-row items-center gap-2 px-1">
        {places.places.map((place) => (
          <PlaceChip key={place.path} place={place} here={place.path === here} onGo={onGo} />
        ))}
      </View>
    </ScrollView>
  );
}
