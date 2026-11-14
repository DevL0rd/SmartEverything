import type { PlannerAlarmRow, PlannerRingTarget, PlannerWatchLink } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { FlatChoice } from '../../../components/flat-choice';
import type { IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import { STATUS_FILL } from '../../../components/tone';
import { useRows } from '../../../store/selectors';
import type { Device, RowOf } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { deviceIcon } from '../../device-visuals';
import { watchDotOf } from '../../planner/clock/alarm-text';
import { WatchStateLines } from '../../planner/clock/watch-state-line';
import { isLocalWatch } from '../../watches';
import { hasTarget, targetKeyOf } from './alarm-draft';

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

export interface RingSources {
  readonly clients: readonly RowOf<'clients'>[];
  readonly devices: readonly Device[];
  readonly selfId: string | null;
  readonly profileId: string | null;
}

function clientPlace(client: RowOf<'clients'>, selfId: string | null): RingPlace {
  const kind = isRingingKind(client.kind) ? RINGING_CLIENTS[client.kind] : null;
  return {
    target: { kind: 'client', clientId: client.id },
    icon: kind?.icon ?? 'monitor',
    name: client.id === selfId && kind !== null ? kind.self : client.name,
    link: null,
  };
}

function devicePlace(device: Device, links: readonly PlannerWatchLink[]): RingPlace {
  return {
    target: { kind: 'device', deviceId: device.id },
    icon: isLocalWatch(device) ? 'watch' : deviceIcon(device),
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
    .filter((client) => client.profile_id === sources.profileId && isRingingKind(client.kind))
    .map((client) => ({ kind: 'client' as const, clientId: client.id }));
  const watches = sources.devices
    .filter((device) => isPersonWatch(device, sources.profileId))
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

export function useRingSources(profileId: string | null): RingSources {
  const clients = useRows('clients');
  const devices = useRows('devices');
  const selfId = useStoreSelector((state) => state.session?.client.id ?? null);
  return { clients, devices, selfId, profileId };
}

export function hasPersonWatch(sources: RingSources): boolean {
  return sources.devices.some((device) => isPersonWatch(device, sources.profileId));
}

function dotOf(place: RingPlace): string | undefined {
  if (place.link === null) return undefined;
  const tone = watchDotOf(place.link.state);
  return tone === null ? undefined : STATUS_FILL[tone];
}

export interface RingTargetsProps {
  readonly places: readonly RingPlace[];
  readonly targets: readonly PlannerRingTarget[];
  readonly watch: readonly PlannerWatchLink[];
  readonly disabled: boolean;
  readonly onToggle: (target: PlannerRingTarget) => void;
}

export function RingTargets({
  places,
  targets,
  watch,
  disabled,
  onToggle,
}: RingTargetsProps): ReactNode {
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="variant">
        Rings on
      </Text>
      {places.length === 0 ? (
        <Text variant="footnote" tone="variant">
          No phone, computer or watch of yours is paired.
        </Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {places.map((place) => (
            <FlatChoice
              key={targetKeyOf(place.target)}
              role="checkbox"
              spoken={`Rings on ${place.name}`}
              label={place.name}
              icon={place.icon}
              swatchClassName={dotOf(place)}
              active={hasTarget(targets, place.target)}
              disabled={disabled}
              onPress={() => {
                onToggle(place.target);
              }}
            />
          ))}
        </View>
      )}
      <WatchStateLines alarm={{ watch }} />
    </View>
  );
}
