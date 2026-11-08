import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import type { PhotoPlace } from '@smarteverything/domain';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { inViewLine } from './place-model';
import { PlaceRowItem } from './places-list';

export function PhonePlacesPanel({
  places,
  total,
}: {
  readonly places: readonly PhotoPlace[];
  readonly total: number;
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <View
      className={cn(
        'absolute inset-x-3 bottom-3 rounded-xl border-hairline border-outline-variant bg-surface-raised px-4 pb-3',
        open && 'top-1/3',
      )}
    >
      <Interactive
        label={open ? 'Show less of places in view' : 'Show places in view'}
        expanded={open}
        onPress={() => {
          setOpen(!open);
        }}
        className="items-center gap-1 pt-2"
        layerClassName="rounded-lg"
      >
        <View className="h-1 w-9 rounded-full bg-outline-variant" />
        <View className="w-full flex-row items-baseline justify-between py-1">
          <Text variant="title-3">Places in view</Text>
          <Text variant="footnote" tone="variant" className="tabular-nums">
            {inViewLine(places.length, total)}
          </Text>
        </View>
      </Interactive>
      {open ? (
        <ScrollView className="-mx-2.5 flex-1">
          {places.map((place) => (
            <PlaceRowItem key={place.id} place={place} share={null} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
