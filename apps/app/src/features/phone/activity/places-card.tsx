import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { clock } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useRow } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { usePhoneFace } from '../card/use-phone-face';
import { usePhonePlaces } from '../data/phone-places';

function Locked({ device }: { readonly device: Device }): ReactNode {
  const profileId = device.details['profileId'];
  const person = useRow('profiles', typeof profileId === 'string' ? profileId : null)?.name;
  return (
    <View className="flex-row items-start gap-2">
      <Icon name="lock" size={16} tone="variant" />
      <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
        {`Places stay with ${person ?? 'the phone’s person'}.`}
      </Text>
    </View>
  );
}

function Visits({ device }: { readonly device: Device }): ReactNode {
  const now = useMinute();
  const { visits, error } = usePhonePlaces(device.id, now, true);
  if (error !== null) {
    return (
      <Text variant="callout" tone="critical">
        Places couldn’t be loaded.
      </Text>
    );
  }
  if (visits === undefined) return <Skeleton shape="block" className="h-16" />;
  if (visits.length === 0) {
    return (
      <Text variant="callout" tone="variant">
        No named places visited today.
      </Text>
    );
  }
  return visits.map((visit) => (
    <View key={visit.id} className="min-h-9 flex-row items-center gap-2.5">
      <Icon name={visit.arrived ? 'mapPin' : 'away'} size={20} tone="variant" />
      <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
        {`${visit.arrived ? 'Arrived at' : 'Left'} ${visit.place}`}
      </Text>
      <Text variant="callout" tone="variant" className="tabular">
        {clock(visit.at)}
      </Text>
    </View>
  ));
}

export function PlacesCard({ device }: { readonly device: Device }): ReactNode {
  const { access } = usePhoneFace(device);
  return (
    <Card title="Places today" icon="mapPin">
      {access.view.own ? <Visits device={device} /> : <Locked device={device} />}
    </Card>
  );
}
