import { useEffect, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  withRole,
  type DevicePresentation,
  type JsonValue,
  type PresentedCapability,
  type VacuumValues,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { Badge } from '../../../../components/badge';
import { Button } from '../../../../components/button';
import { Card } from '../../../../components/card';
import { ProgressBar } from '../../../../components/charts';
import { EmptyState } from '../../../../components/empty-state';
import { Icon } from '../../../../components/icon';
import { IconButton } from '../../../../components/icon-button';
import { List } from '../../../../components/section';
import { Text } from '../../../../components/text';
import { slotOf } from '../../../../store/command-ledger';
import { useStoreSelector } from '../../../../store/store-context';
import { ledgerEntry } from '../../../../store/subscriptions';
import type { Device } from '../../../../store/state';
import { CapabilityRow } from '../../controls/capability-row';
import { useAction } from '../../controls/use-action';
import { useVacuum } from '../data/use-vacuum';
import { readingOf, valueOrNull, type Reading } from '../model/readings';
import {
  SETTING_ROLES,
  actionBlockedReason,
  START_ACTIONS,
  blockedReason,
  dryLeftText,
  isEmptying,
  isNotInstalled,
  reportedTanks,
  stationDisplay,
  stationOf,
  type StationDisplay,
  type StationAction,
  type StationState,
  type TankLook,
} from './dock-model';

const log = new Logger('app.devices');

function useRefused(deviceId: string, key: string): boolean {
  return useStoreSelector(
    (state) => (ledgerEntry(state, slotOf(deviceId, key))?.failure ?? null) !== null,
    Object.is,
    [deviceId, key],
  );
}

function StationButton({
  device,
  presented,
  action,
  disabled,
}: {
  readonly device: Device;
  readonly presented: PresentedCapability;
  readonly action: StationAction;
  readonly disabled: boolean;
}): ReactNode {
  const opener = useRef<View>(null);
  const handle = useAction(device, presented, opener);
  return (
    <View className="min-w-36 grow basis-36">
      <Button
        label={action.label}
        icon={action.icon}
        size="lg"
        variant="tonal"
        loading={handle.pending}
        disabled={disabled}
        ref={opener}
        onPress={handle.run}
      />
      {handle.sheet}
    </View>
  );
}

function DustRefusal({
  deviceId,
  presented,
}: {
  readonly deviceId: string;
  readonly presented: PresentedCapability;
}): ReactNode {
  return useRefused(deviceId, presented.key) ? (
    <View className="flex-row items-center gap-2" accessibilityLiveRegion="polite">
      <Icon name="alert" size={20} tone="warning" />
      <Text variant="footnote" tone="warning" className="flex-1">
        The station emptied the bin recently. Try again later.
      </Text>
    </View>
  ) : null;
}

function StationActions({
  device,
  presentation,
  values,
  reason,
}: {
  readonly device: Device;
  readonly presentation: DevicePresentation;
  readonly values: VacuumValues;
  readonly reason: string | null;
}): ReactNode {
  const dust = withRole(presentation, 'vacuum_empty_dust');
  const reasons = START_ACTIONS.map((action) =>
    actionBlockedReason({ role: action.role, stationReason: reason, values }),
  );
  const shown = [...new Set(reasons.filter((text) => text !== null))];
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        {START_ACTIONS.map((action, index) => {
          const presented = withRole(presentation, action.role);
          return presented === undefined ? null : (
            <StationButton
              key={action.role}
              device={device}
              presented={presented}
              action={action}
              disabled={reasons[index] !== null}
            />
          );
        })}
      </View>
      {shown.map((text) => (
        <Text key={text} variant="footnote" tone="variant">
          {text}
        </Text>
      ))}
      {dust === undefined ? null : <DustRefusal deviceId={device.id} presented={dust} />}
    </View>
  );
}

function StationStatus({
  display,
  left,
}: {
  readonly display: StationDisplay;
  readonly left: string | null;
}): ReactNode {
  const { word, icon, busy, progress } = display;
  return (
    <View className="gap-2">
      <View className="min-h-touch-min flex-row items-center gap-3">
        <Icon name={icon} size={24} tone={busy ? 'primary' : 'variant'} />
        <View className="min-w-0 flex-1">
          <Text variant="body-strong" numberOfLines={2} accessibilityLiveRegion="polite">
            {word}
          </Text>
          {left === null ? null : (
            <Text variant="footnote" tone="variant">
              {left}
            </Text>
          )}
        </View>
        {progress === null ? null : (
          <Text variant="label" tone="variant" className="tabular">
            {`${String(Math.round(progress * 100))}%`}
          </Text>
        )}
      </View>
      {progress === null ? null : <ProgressBar progress={progress} colour="primary" label={word} />}
    </View>
  );
}

function TankRow({
  label,
  look,
  action,
}: {
  readonly label: string;
  readonly look: TankLook;
  readonly action: ReactNode;
}): ReactNode {
  return (
    <View className="min-h-touch-min min-w-64 grow basis-72 flex-row items-center gap-2">
      <Icon name="glassWater" size={20} tone="variant" />
      <Text variant="body" numberOfLines={1} className="min-w-0 shrink">
        {label}
      </Text>
      <View className="ml-auto">
        <Badge label={look.word} tone={look.tone} icon={look.icon} />
      </View>
      {action}
    </View>
  );
}

function EmptyTankButton({
  device,
  presented,
  label,
  disabled,
}: {
  readonly device: Device;
  readonly presented: PresentedCapability;
  readonly label: string;
  readonly disabled: boolean;
}): ReactNode {
  const opener = useRef<View>(null);
  const handle = useAction(device, presented, opener);
  return (
    <>
      <IconButton
        icon="trash"
        label={`Empty ${label.toLowerCase()}`}
        variant="tonal"
        disabled={disabled || handle.pending}
        ref={opener}
        onPress={handle.run}
      />
      {handle.sheet}
    </>
  );
}

function tankAction(
  device: Device,
  emptier: PresentedCapability | undefined,
  value: JsonValue | undefined,
  { label, reason }: { readonly label: string; readonly reason: string | null },
): ReactNode {
  if (emptier === undefined || isNotInstalled(value)) {
    return null;
  }
  return (
    <EmptyTankButton
      device={device}
      presented={emptier}
      label={label}
      disabled={reason !== null || isEmptying(value)}
    />
  );
}

function Tanks({
  device,
  presentation,
  values,
  reason,
}: {
  readonly device: Device;
  readonly presentation: DevicePresentation;
  readonly values: VacuumValues;
  readonly reason: string | null;
}): ReactNode {
  const tanks = reportedTanks(values);
  if (tanks.length === 0) {
    return null;
  }
  return (
    <View className="flex-row flex-wrap gap-x-6 border-t-hairline border-outline-variant pt-2">
      {tanks.map((tank) => {
        const value = values[tank.role];
        const emptier =
          tank.emptyRole === null ? undefined : withRole(presentation, tank.emptyRole);
        return (
          <TankRow
            key={tank.role}
            label={tank.label}
            look={tank.look(value)}
            action={tankAction(device, emptier, value, { label: tank.label, reason })}
          />
        );
      })}
      {tanks.length % 2 === 1 ? <View aria-hidden className="min-w-64 grow basis-72" /> : null}
    </View>
  );
}

function StationCard({
  device,
  presentation,
  values,
  station,
}: {
  readonly device: Device;
  readonly presentation: DevicePresentation;
  readonly values: VacuumValues;
  readonly station: Reading<StationState | null>;
}): ReactNode {
  const state = valueOrNull(station);
  const reason = blockedReason({ online: device.online, values, busy: state?.busy ?? false });
  return (
    <Card title="Omni station" icon="droplet">
      <StationStatus display={stationDisplay(station)} left={dryLeftText(values, state)} />
      <StationActions device={device} presentation={presentation} values={values} reason={reason} />
      <Tanks device={device} presentation={presentation} values={values} reason={reason} />
    </Card>
  );
}

function StationSettings({
  device,
  presentation,
}: {
  readonly device: Device;
  readonly presentation: DevicePresentation;
}): ReactNode {
  const rows = SETTING_ROLES.flatMap((role) => {
    const presented = withRole(presentation, role);
    return presented?.writable === true ? [presented] : [];
  });
  if (rows.length === 0) {
    return null;
  }
  return (
    <List title="Station settings">
      {rows.map((presented) => (
        <CapabilityRow key={presented.key} device={device} presented={presented} reason={null} />
      ))}
    </List>
  );
}

function useStationProblem(deviceId: string, reading: Reading<StationState | null>): void {
  const problem = reading.ok ? '' : reading.problem;
  useEffect(() => {
    if (problem !== '') {
      log.warn('vacuum.station_unreadable', { deviceId, problem });
    }
  }, [deviceId, problem]);
}

export function VacuumDock({ device }: { readonly device: Device }): ReactNode {
  const { presentation, snapshot } = useVacuum(device);
  const { values } = snapshot;
  const station = readingOf(() => stationOf(values));
  useStationProblem(device.id, station);
  const reported = !station.ok || station.value !== null || reportedTanks(values).length > 0;
  if (!reported) {
    return (
      <EmptyState
        icon="droplet"
        title="No station reported"
        body="This robot has not reported a station yet."
      />
    );
  }
  return (
    <View className="gap-4">
      <StationCard device={device} presentation={presentation} values={values} station={station} />
      <StationSettings device={device} presentation={presentation} />
    </View>
  );
}
