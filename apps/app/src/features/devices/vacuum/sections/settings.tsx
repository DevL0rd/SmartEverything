import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  VACUUM_COUPLINGS,
  type DevicePresentation,
  type JsonValue,
  type PresentedCapability,
  type VacuumCoupling,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../../components/button';
import { confirm } from '../../../../components/confirm-store';
import { EmptyState } from '../../../../components/empty-state';
import { Icon } from '../../../../components/icon';
import { ListRow } from '../../../../components/list-row';
import { SelectRow, SwitchRow, ValueRow } from '../../../../components/rows';
import { List } from '../../../../components/section';
import { Text } from '../../../../components/text';
import type { Device } from '../../../../store/state';
import { RobotMapFeed } from '../../../home-map';
import { CapabilityRow } from '../../controls/capability-row';
import { Guard, offlineReason } from '../../controls/guard';
import { useDeviceControl } from '../../controls/use-device-control';
import { useDeviceModel, shownValue } from '../../model/device-model';
import { useDisplayName } from '../../model/display-name';
import { presentedFor } from '../model/presented-refs';
import {
  LINK_ROOMS_NOTE,
  LINK_ROOMS_TITLE,
  MAP_FEED_TITLE,
  MAP_GROUP_TITLE,
  MAP_MOVED_LINE,
  SETTING_GROUPS,
  type SettingGroupSpec,
} from '../search-items';
import { SETTING_GROUP_BODIES } from './settings-dnd';
import { ReadingRow, useSystemRows } from './settings-about';
import { VacuumLookSettings } from './settings-look';
import { VacuumOtherSettings } from './settings-other';

export interface SettingsGroup {
  readonly spec: SettingGroupSpec;
  readonly rows: readonly PresentedCapability[];
  readonly readings: readonly PresentedCapability[];
  readonly guarded: readonly PresentedCapability[];
}

function rowsFor(
  presentation: DevicePresentation,
  refs: readonly string[],
  placed: Set<string>,
): readonly PresentedCapability[] {
  const found = refs.flatMap((ref) => {
    const presented = presentedFor(presentation, ref);
    return presented === undefined || placed.has(presented.key) ? [] : [presented];
  });
  for (const presented of found) {
    placed.add(presented.key);
  }
  return found;
}

export function settingsGroupsOf(presentation: DevicePresentation): readonly SettingsGroup[] {
  const placed = new Set<string>();
  return SETTING_GROUPS.map((spec) => ({
    spec,
    rows: rowsFor(presentation, spec.rows, placed),
    readings: rowsFor(presentation, spec.readings?.rows ?? [], placed),
    guarded: rowsFor(presentation, spec.guarded?.rows ?? [], placed),
  })).filter((group) => group.rows.length + group.readings.length + group.guarded.length > 0);
}

export function couplingChanges(
  presentation: DevicePresentation,
  coupling: VacuumCoupling,
): readonly string[] {
  return coupling.rewrites.flatMap((key) => {
    const label = presentation.capabilities.find((presented) => presented.key === key)?.label;
    return label === undefined ? [] : [label];
  });
}

export function couplingBody(changes: readonly string[], coupling: VacuumCoupling): string {
  return changes.length === 0
    ? coupling.note
    : `${coupling.note} It also changes: ${changes.join(', ')}.`;
}

export function isGuardedValue(presented: PresentedCapability): boolean {
  return (
    presented.writable &&
    presented.danger.tier !== 'none' &&
    presented.capability.value.kind !== 'action'
  );
}

export async function confirmedSet(request: {
  readonly presented: PresentedCapability;
  readonly deviceName: string;
  readonly note: string | null;
  readonly send: () => Promise<boolean>;
}): Promise<boolean> {
  const { presented, deviceName, note, send } = request;
  const danger = presented.danger;
  if (danger.tier !== 'none') {
    const accepted = await confirm({
      title: `${presented.label}?`,
      body: note ?? `${deviceName} will do this right away.`,
      confirmLabel: 'Change',
      tone: 'destructive',
      ...(danger.tier === 'typed' ? { typed: danger.word } : {}),
    });
    if (!accepted) {
      return false;
    }
  }
  return send();
}

function CouplingNote({
  coupling,
  changes,
}: {
  readonly coupling: VacuumCoupling;
  readonly changes: readonly string[];
}): ReactNode {
  return (
    <View className="mx-4 mb-3 flex-row items-start gap-3 rounded-md bg-surface-2 p-3">
      <Icon name="info" size={20} tone="variant" />
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="footnote" tone="variant">
          {coupling.note}
        </Text>
        {changes.length === 0 ? null : (
          <Text variant="footnote" tone="variant">
            {`Also changes: ${changes.join(', ')}`}
          </Text>
        )}
      </View>
    </View>
  );
}

function useGuardedChange(
  device: Device,
  presented: PresentedCapability,
  note: string | null,
): { readonly value: JsonValue | undefined; readonly change: (value: JsonValue) => void } {
  const control = useDeviceControl(device, presented);
  const name = useDisplayName(device.id);
  const change = (value: JsonValue): void => {
    background(
      confirmedSet({ presented, deviceName: name, note, send: () => control.set(value) }),
      'vacuum.guarded_set_failed',
    );
  };
  return { value: control.value, change };
}

function GuardedValue({
  device,
  presented,
  reason,
  note,
}: {
  readonly device: Device;
  readonly presented: PresentedCapability;
  readonly reason: string | null;
  readonly note: string | null;
}): ReactNode {
  const { value, change } = useGuardedChange(device, presented, note);
  const kind = presented.capability.value.kind;
  if (kind === 'boolean') {
    return (
      <Guard reason={reason}>
        <SwitchRow
          title={presented.label}
          value={value === true}
          disabled={reason !== null}
          onChange={change}
        />
      </Guard>
    );
  }
  if (kind === 'enum') {
    return (
      <Guard reason={reason}>
        <SelectRow
          title={presented.label}
          options={presented.options}
          value={typeof value === 'string' ? value : null}
          disabled={reason !== null}
          onChange={change}
        />
      </Guard>
    );
  }
  return <ValueRow title={presented.label} value={shownValue(presented, value)} />;
}

export function SettingRow({
  device,
  presentation,
  presented,
  reason,
}: {
  readonly device: Device;
  readonly presentation: DevicePresentation;
  readonly presented: PresentedCapability;
  readonly reason: string | null;
}): ReactNode {
  const coupling = VACUUM_COUPLINGS[presented.key];
  const changes = coupling === undefined ? [] : couplingChanges(presentation, coupling);
  const note = coupling === undefined ? null : couplingBody(changes, coupling);
  return (
    <View>
      {isGuardedValue(presented) ? (
        <GuardedValue device={device} presented={presented} reason={reason} note={note} />
      ) : (
        <CapabilityRow device={device} presented={presented} reason={reason} />
      )}
      {coupling === undefined ? null : <CouplingNote coupling={coupling} changes={changes} />}
    </View>
  );
}

interface GroupProps {
  readonly device: Device;
  readonly presentation: DevicePresentation;
  readonly group: SettingsGroup;
  readonly reason: string | null;
}

function GroupLists({
  device,
  presentation,
  group,
  reason,
  extra,
}: GroupProps & { readonly extra?: ReactNode }): ReactNode {
  const { spec } = group;
  const readings = spec.readings;
  const row = (presented: PresentedCapability): ReactNode => (
    <SettingRow
      key={presented.key}
      device={device}
      presentation={presentation}
      presented={presented}
      reason={reason}
    />
  );
  return (
    <View className="gap-section-gap">
      <List title={spec.title} {...(spec.note === undefined ? {} : { footer: spec.note })}>
        {group.rows.map(row)}
        {readings === undefined
          ? null
          : group.readings.map((presented) => (
              <ReadingRow
                key={presented.key}
                device={device}
                presented={presented}
                note={readings.note}
              />
            ))}
        {extra}
      </List>
      {spec.guarded === undefined || group.guarded.length === 0 ? null : (
        <List title={spec.guarded.title} footer={spec.guarded.note}>
          {group.guarded.map(row)}
        </List>
      )}
    </View>
  );
}

function SystemGroup(props: GroupProps): ReactNode {
  return <GroupLists {...props} extra={useSystemRows(props.device)} />;
}

interface VacuumSettingsProps {
  readonly device: Device;
  readonly onShowRooms: () => void;
}

export function VacuumMapGroup({ device, onShowRooms }: VacuumSettingsProps): ReactNode {
  return (
    <List title={MAP_GROUP_TITLE} footer={MAP_MOVED_LINE}>
      <RobotMapFeed variant="summary" deviceId={device.id} title={MAP_FEED_TITLE} />
      <ListRow
        title={LINK_ROOMS_TITLE}
        icon="link"
        subtitle={LINK_ROOMS_NOTE}
        wrapSubtitle
        trailing={<Button label="Rooms card" icon="door" variant="tonal" onPress={onShowRooms} />}
      />
    </List>
  );
}

export function VacuumSettings({ device, onShowRooms }: VacuumSettingsProps): ReactNode {
  const { presentation } = useDeviceModel(device);
  const name = useDisplayName(device.id);
  const groups = settingsGroupsOf(presentation);
  const reason = device.online ? null : offlineReason(name);
  const map = <VacuumMapGroup device={device} onShowRooms={onShowRooms} />;
  if (groups.length === 0) {
    return (
      <View className="gap-section-gap">
        <EmptyState
          icon="settings"
          title="No settings reported"
          body="The robot has not reported any settings yet."
        />
        {map}
        <VacuumLookSettings device={device} />
      </View>
    );
  }
  return (
    <View className="gap-section-gap">
      {groups.map((group) => {
        const Body = SETTING_GROUP_BODIES[group.spec.id];
        const Lists = group.spec.id === 'system' ? SystemGroup : GroupLists;
        return Body === undefined ? (
          <Lists
            key={group.spec.id}
            device={device}
            presentation={presentation}
            group={group}
            reason={reason}
          />
        ) : (
          <Body key={group.spec.id} device={device} />
        );
      })}
      {map}
      <VacuumLookSettings device={device} />
      <VacuumOtherSettings device={device} presentation={presentation} reason={reason} />
    </View>
  );
}
