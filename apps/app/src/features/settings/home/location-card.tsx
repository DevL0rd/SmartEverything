import type { GeoPoint } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { updateHome } from '../../../api/settings';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { confirm } from '../../../components/confirm-store';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { useSizeClass } from '../../../design/size-class';
import { useMinute } from '../../../store/clock';
import { useIsOwner, useSettings } from '../../../store/selectors';
import { LocationSheet } from './location-sheet';
import { sunLines } from './place';

import { trackSetting } from '../settings-log';
import { background } from '@smarteverything/logging';
const PLACE_UNNAMED = 'Your home';

function pointOf(settings: ReturnType<typeof useSettings>): GeoPoint | null {
  const { latitude, longitude } = settings;
  return latitude === null || longitude === null ? null : { latitude, longitude };
}

async function removeLocation(): Promise<void> {
  const sure = await confirm({
    title: 'Remove the location?',
    body: 'Weather, sunrise and sunset stop until you set it again.',
    confirmLabel: 'Remove',
    tone: 'destructive',
  });
  if (!sure) {
    return;
  }
  await trackSetting('home_location.remove', {}, () =>
    updateHome({ latitude: null, longitude: null }),
  ).catch(notifyFailure('The location was not removed'));
}

function PlaceTile(): ReactNode {
  return (
    <View className="size-12 items-center justify-center rounded-lg bg-primary-container">
      <Icon name="mapPin" size={24} colour="on-primary-container" />
    </View>
  );
}

function SunLines({
  point,
  zone,
  now,
}: {
  readonly point: GeoPoint;
  readonly zone: string;
  readonly now: number;
}): ReactNode {
  const lines = sunLines(point, zone, new Date(now));
  const stacked = useSizeClass().width === 'compact';
  return (
    <View>
      {(stacked ? lines : [lines.join(' · ')]).map((line) => (
        <Text key={line} variant="footnote" tone="variant" numberOfLines={1}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function SetPlace({
  name,
  point,
  owner,
  onChange,
}: {
  readonly name: string | null;
  readonly point: GeoPoint;
  readonly owner: boolean;
  readonly onChange: () => void;
}): ReactNode {
  const zone = useSettings().time_zone;
  const now = useMinute();
  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-4">
        <PlaceTile />
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="title-2" numberOfLines={2}>
            {name ?? PLACE_UNNAMED}
          </Text>
          <SunLines point={point} zone={zone} now={now} />
        </View>
      </View>
      {owner ? (
        <View className="flex-row flex-wrap gap-2">
          <Button label="Change" variant="tonal" icon="pencil" onPress={onChange} />
          <Button
            label="Remove"
            variant="text"
            icon="trash"
            onPress={() => {
              background(removeLocation(), 'location.remove_failed');
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

function NoPlace({
  owner,
  onSet,
}: {
  readonly owner: boolean;
  readonly onSet: () => void;
}): ReactNode {
  return (
    <View className="items-center gap-3 py-4">
      <PlaceTile />
      <View className="items-center gap-1">
        <Text variant="title-3" align="center">
          Where’s your home?
        </Text>
        <Text variant="footnote" tone="variant" align="center">
          {owner ? 'Used for weather, sunrise and sunset.' : 'The home’s owner can set it.'}
        </Text>
      </View>
      {owner ? <Button label="Set location" icon="mapPin" size="lg" onPress={onSet} /> : null}
    </View>
  );
}

export function LocationCard(): ReactNode {
  const settings = useSettings();
  const owner = useIsOwner();
  const [editing, setEditing] = useState(false);
  const point = pointOf(settings);
  const open = (): void => {
    setEditing(true);
  };
  return (
    <>
      <Card>
        {point === null ? (
          <NoPlace owner={owner} onSet={open} />
        ) : (
          <SetPlace name={settings.location_name} point={point} owner={owner} onChange={open} />
        )}
      </Card>
      {editing ? (
        <LocationSheet
          onClose={() => {
            setEditing(false);
          }}
        />
      ) : null}
    </>
  );
}
