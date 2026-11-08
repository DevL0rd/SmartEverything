import type { PlannerAlarmRow, PlannerRingTarget, PlannerWatchLink } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Dot } from '../../../components/badge';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import type { StatusTone } from '../../../components/tone';
import { useRow } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import { deviceIcon } from '../../device-visuals';
import { wakeRoutineTimeOf, watchDotOf } from './alarm-text';
import { useWatchName } from './watch-state-line';

interface ChipProps {
  readonly icon: IconName;
  readonly label: string;
  readonly dot?: StatusTone | null;
}

const CLIENT_ICON = {
  phone: 'smartphone',
  tablet: 'smartphone',
  computer: 'monitor',
  browser: 'monitor',
} as const;

const SELF_NAME = {
  phone: 'This phone',
  tablet: 'This tablet',
  computer: 'This computer',
  browser: 'This browser',
} as const;

export function TargetChip({ icon, label, dot = null }: ChipProps): ReactNode {
  return (
    <View className="min-h-8 flex-row items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1">
      <Icon name={icon} size={16} tone="variant" />
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {label}
      </Text>
      {dot === null ? null : <Dot tone={dot} />}
    </View>
  );
}

function ClientChip({ clientId }: { readonly clientId: string }): ReactNode {
  const client = useRow('clients', clientId);
  const self = useStoreSelector((state) => state.session?.client.id === clientId);
  if (client === null) return <TargetChip icon="monitor" label="Removed device" />;
  return (
    <TargetChip
      icon={CLIENT_ICON[client.kind]}
      label={self ? SELF_NAME[client.kind] : client.name}
    />
  );
}

function WatchChip({ link }: { readonly link: PlannerWatchLink }): ReactNode {
  return (
    <TargetChip icon="watch" label={useWatchName(link.deviceId)} dot={watchDotOf(link.state)} />
  );
}

function DeviceChip({ deviceId }: { readonly deviceId: string }): ReactNode {
  const device = useRow('devices', deviceId);
  if (device === null) return <TargetChip icon="cpu" label="Removed device" />;
  return <TargetChip icon={deviceIcon(device)} label={device.label} />;
}

function RingTargetChip({
  target,
  watch,
}: {
  readonly target: PlannerRingTarget;
  readonly watch: readonly PlannerWatchLink[];
}): ReactNode {
  if (target.kind === 'client') return <ClientChip clientId={target.clientId} />;
  const link = watch.find((entry) => entry.deviceId === target.deviceId);
  return link === undefined ? <DeviceChip deviceId={target.deviceId} /> : <WatchChip link={link} />;
}

function WakeRoutineChip({ alarm }: { readonly alarm: PlannerAlarmRow }): ReactNode {
  const scene = useRow('scenes', alarm.wake_scene_id);
  const at = wakeRoutineTimeOf(alarm);
  if (scene === null || at === null) return null;
  return <TargetChip icon="sunrise" label={`${scene.name} ${at}`} />;
}

export function looseWatchLinksOf(alarm: PlannerAlarmRow): readonly PlannerWatchLink[] {
  return alarm.watch.filter(
    (link) =>
      !alarm.targets.some(
        (target) => target.kind === 'device' && target.deviceId === link.deviceId,
      ),
  );
}

function targetKeyOf(target: PlannerRingTarget): string {
  return target.kind === 'client' ? `client:${target.clientId}` : `device:${target.deviceId}`;
}

export function TargetChips({ alarm }: { readonly alarm: PlannerAlarmRow }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      {alarm.targets.map((target) => (
        <RingTargetChip key={targetKeyOf(target)} target={target} watch={alarm.watch} />
      ))}
      {looseWatchLinksOf(alarm).map((link) => (
        <WatchChip key={`watch:${link.deviceId}`} link={link} />
      ))}
      <WakeRoutineChip alarm={alarm} />
      {alarm.smart_minutes === null ? null : (
        <TargetChip icon="watch" label={`Smart ${String(alarm.smart_minutes)} min`} />
      )}
    </View>
  );
}
