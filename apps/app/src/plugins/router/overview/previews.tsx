import { formatByteRate, type NetworkClient, type RouterSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { SignalBars } from '../../../components/signal-bars';
import { Text } from '../../../components/text';
import { count, decimal } from '../../../format/number';
import { joinParts, plural } from '../../../format/text';
import { ProfileAvatar } from '../../../features/profiles';
import { useProfiles } from '../../../store/people';
import type { Device } from '../../../store/state';
import { SectionPreview } from '../../shared/section-preview';
import { connectionText, signalOf } from '../client-model';
import { widgetPeople } from '../widgets/people-model';
import { routerSectionHref } from './links';
import { presenceLabel, presenceLine, trackedPeople } from './people-model';

const PREVIEW_CLIENTS = 5;
const BUSY_WARNING = 60;

function busiest(snapshot: RouterSnapshot): readonly NetworkClient[] {
  return snapshot.clients
    .filter((client) => client.connected)
    .sort((left, right) => (right.trafficBytesPerSecond ?? 0) - (left.trafficBytesPerSecond ?? 0))
    .slice(0, PREVIEW_CLIENTS);
}

export function DevicesPreview({
  device,
  snapshot,
}: {
  readonly device: Device;
  readonly snapshot: RouterSnapshot;
}): ReactNode {
  const live = snapshot.connection.state === 'online';
  const online = snapshot.clients.filter((client) => client.connected).length;
  if (snapshot.clients.length === 0) {
    return null;
  }
  return (
    <SectionPreview
      title="Devices on the network"
      caption={`${count(online)} online`}
      total={snapshot.clients.length}
      href={routerSectionHref(device.id, 'clients')}
    >
      {busiest(snapshot).map((client) => {
        const rate = client.trafficBytesPerSecond ?? 0;
        return (
          <ListRow
            key={client.mac}
            title={client.name}
            subtitle={joinParts([connectionText(client), client.ip])}
            icon={client.connection === 'wired' ? 'monitor' : 'smartphone'}
            href={routerSectionHref(device.id, 'clients', { mac: client.mac })}
            chevron
            trailing={
              <View className="flex-row items-center gap-2">
                {live && rate > 0 ? (
                  <Text variant="footnote" tone="variant" className="tabular">
                    {formatByteRate(rate)}
                  </Text>
                ) : null}
                {client.connection === 'wifi' ? (
                  <SignalBars dbm={signalOf(snapshot, client.mac)} />
                ) : null}
              </View>
            }
          />
        );
      })}
    </SectionPreview>
  );
}

export function PeoplePreview({
  device,
  snapshot,
}: {
  readonly device: Device;
  readonly snapshot: RouterSnapshot;
}): ReactNode {
  const profiles = useProfiles();
  const presence = trackedPeople(snapshot.people);
  if (presence.length === 0) {
    return null;
  }
  const people = widgetPeople(presence, profiles);
  return (
    <Card
      href={routerSectionHref(device.id, 'clients', { filter: 'people' })}
      label={presenceLabel(presence)}
    >
      <View className="flex-row items-center gap-3">
        <View aria-hidden className="flex-row">
          {people.map((person, index) => (
            <View
              key={person.id}
              className={
                index === 0 ? 'rounded-full' : '-ml-2 rounded-full border-2 border-surface-1'
              }
            >
              <ProfileAvatar profile={person.profile} />
            </View>
          ))}
        </View>
        <View className="min-w-0 flex-1">
          <Text variant="body-strong">People home</Text>
          <Text variant="footnote" tone="variant" numberOfLines={2}>
            {presenceLine(presence)}
          </Text>
        </View>
        <Icon name="chevronRight" size={16} tone="variant" />
      </View>
    </Card>
  );
}

export function WifiPreview({
  device,
  snapshot,
}: {
  readonly device: Device;
  readonly snapshot: RouterSnapshot;
}): ReactNode {
  if (snapshot.radios.length === 0) {
    return null;
  }
  return (
    <SectionPreview title="Wi-Fi" href={routerSectionHref(device.id, 'wifi')}>
      {snapshot.radios.map((radio) => {
        const off = radio.enabled === false;
        const busy = radio.airtimeBusyPercent;
        return (
          <ListRow
            key={radio.band}
            title={radio.band}
            subtitle={
              off
                ? 'Off'
                : joinParts([
                    `${count(radio.clients)} ${plural(radio.clients, 'device')}`,
                    busy === null ? null : `${decimal(busy)} % busy`,
                  ])
            }
            icon="wifi"
            iconTone={off ? 'faint' : 'primary'}
            subtitleTone={!off && busy !== null && busy > BUSY_WARNING ? 'warning' : 'variant'}
          />
        );
      })}
    </SectionPreview>
  );
}
