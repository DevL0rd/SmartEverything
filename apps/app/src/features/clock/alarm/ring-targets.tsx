import type { PlannerAlarmRow, PlannerRingTarget, PlannerWatchLink } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { IconName } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { SwitchRow } from '../../../components/rows';
import { sameJson } from '../../../store/same-json';
import { rowsOf, type Device, type RowOf, type StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { deviceIcon } from '../../device-visuals';
import { WatchStateLines } from '../../planner';
import { isLocalWatch } from '../../watches';
import { hasTarget, targetKeyOf } from './alarm-draft';
import { FieldSection } from './alarm-fields';

export interface RingPlace {
  readonly target: PlannerRingTarget;
  readonly icon: IconName;
  readonly name: string;
  readonly link: PlannerWatchLink | null;
}

const RINGING_CLIENTS = {
  phone: { icon: 'smartphone', self: 'This phone' },
  tablet: { icon: 'smartphone', self: 'This tablet' },
  computer: { icon: 'monitor', self: 'This computer' },
} as const;

type RingingKind = keyof typeof RINGING_CLIENTS;

function isRingingKind(kind: string): kind is RingingKind {
  return kind in RINGING_CLIENTS;
}

export function isPersonWatch(device: Device, profileId: string | null): boolean {
  return isLocalWatch(device) && device.details['profileId'] === profileId;
}

export type RingClient = Pick<
  RowOf<'clients'>,
  'id' | 'name' | 'kind' | 'platform' | 'built_in' | 'profile_id'
>;

export interface RingDevice {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly icon: IconName;
  readonly personWatch: boolean;
}

export interface RingSources {
  readonly clients: readonly RingClient[];
  readonly devices: readonly RingDevice[];
  readonly selfId: string | null;
  readonly profileId: string | null;
}

function clientPlace(client: RingClient, selfId: string | null): RingPlace {
  const kind = isRingingKind(client.kind) ? RINGING_CLIENTS[client.kind] : null;
  return {
    target: { kind: 'client', clientId: client.id },
    icon: kind?.icon ?? 'monitor',
    name: client.id === selfId && kind !== null ? kind.self : client.name,
    link: null,
  };
}

function devicePlace(device: RingDevice, links: readonly PlannerWatchLink[]): RingPlace {
  return {
    target: { kind: 'device', deviceId: device.id },
    icon: device.icon,
    name: device.label,
    link: links.find((link) => link.deviceId === device.id) ?? null,
  };
}

function removedPlace(target: PlannerRingTarget): RingPlace {
  return { target, icon: 'monitor', name: 'Removed device', link: null };
}

function targetPlace(
  target: PlannerRingTarget,
  sources: RingSources,
  links: readonly PlannerWatchLink[],
): RingPlace {
  if (target.kind === 'client') {
    const client = sources.clients.find((row) => row.id === target.clientId);
    return client === undefined ? removedPlace(target) : clientPlace(client, sources.selfId);
  }
  const device = sources.devices.find((row) => row.id === target.deviceId);
  return device === undefined ? removedPlace(target) : devicePlace(device, links);
}

function offeredTargets(sources: RingSources): readonly PlannerRingTarget[] {
  const clients = sources.clients
    .filter(
      (client) =>
        !client.built_in && client.profile_id === sources.profileId && isRingingKind(client.kind),
    )
    .map((client) => ({ kind: 'client' as const, clientId: client.id }));
  const watches = sources.devices
    .filter((device) => device.personWatch)
    .map((device) => ({ kind: 'device' as const, deviceId: device.id }));
  return [...clients, ...watches];
}

export function ringPlacesOf(
  sources: RingSources,
  alarm: Pick<PlannerAlarmRow, 'targets' | 'watch'>,
): readonly RingPlace[] {
  const offered = offeredTargets(sources);
  const extra = alarm.targets.filter((target) => !hasTarget(offered, target));
  return [...offered, ...extra].map((target) => targetPlace(target, sources, alarm.watch));
}

function ringDeviceOf(device: Device, profileId: string | null): RingDevice {
  return {
    id: device.id,
    label: device.label,
    kind: device.kind,
    icon: isLocalWatch(device) ? 'watch' : deviceIcon(device),
    personWatch: isPersonWatch(device, profileId),
  };
}

function ringClientOf(client: RowOf<'clients'>): RingClient {
  return {
    id: client.id,
    name: client.name,
    kind: client.kind,
    platform: client.platform,
    built_in: client.built_in,
    profile_id: client.profile_id,
  };
}

function ringSourcesIn(state: StoreState, profileId: string | null): RingSources {
  return {
    clients: rowsOf(state.tables.clients).map(ringClientOf),
    devices: rowsOf(state.tables.devices).map((device) => ringDeviceOf(device, profileId)),
    selfId: state.session?.client.id ?? null,
    profileId,
  };
}

export function useRingSources(profileId: string | null): RingSources {
  return useStoreSelector((state) => ringSourcesIn(state, profileId), sameJson, [profileId]);
}

export function reachesPhone(sources: RingSources, targets: readonly PlannerRingTarget[]): boolean {
  return targets.some((target) =>
    target.kind === 'client'
      ? sources.clients.find((row) => row.id === target.clientId)?.platform === 'android'
      : sources.devices.find((row) => row.id === target.deviceId)?.kind === 'phone',
  );
}

export function hasPersonWatch(sources: RingSources): boolean {
  return sources.devices.some((device) => device.personWatch);
}

export interface RingTargetsProps {
  readonly places: readonly RingPlace[];
  readonly targets: readonly PlannerRingTarget[];
  readonly watch: readonly PlannerWatchLink[];
  readonly compact: boolean;
  readonly disabled: boolean;
  readonly onToggle: (target: PlannerRingTarget) => void;
}

export function RingTargets({
  places,
  targets,
  watch,
  compact,
  disabled,
  onToggle,
}: RingTargetsProps): ReactNode {
  return (
    <View className="gap-2">
      <FieldSection title="Rings on" compact={compact}>
        {places.length === 0 ? (
          <ListRow
            title="No phone, computer or watch of yours is paired"
            icon="smartphone"
            compact={compact}
          />
        ) : (
          places.map((place) => (
            <SwitchRow
              key={targetKeyOf(place.target)}
              title={place.name}
              label={`Rings on ${place.name}`}
              icon={place.icon}
              compact={compact}
              value={hasTarget(targets, place.target)}
              disabled={disabled}
              onChange={() => {
                onToggle(place.target);
              }}
            />
          ))
        )}
      </FieldSection>
      <WatchStateLines alarm={{ watch }} />
    </View>
  );
}
