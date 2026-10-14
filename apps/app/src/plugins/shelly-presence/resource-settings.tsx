import { usePresenceSelection } from './use-presence-selection';
import { type ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import type { ShellyPresenceDevice } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { List } from '../../components/section';
import { NavRow } from '../../components/rows';
import { Text } from '../../components/text';
import { ScheduleEditor, type ScheduleRow } from './schedule-editor';
import { WebhookEditor, type WebhookRow } from './webhook-editor';
import { PresenceActionButton } from './core-form';
import { presenceActionAvailable } from './availability';

function ScheduleList({
  rows,
  select,
}: {
  readonly rows: readonly ScheduleRow[] | undefined;
  readonly select: (id: number) => void;
}): ReactNode {
  return (
    <List title="Schedules">
      {rows?.map((row) => (
        <NavRow
          key={row.id}
          title={row.timespec}
          subtitle={`${row.enable ? 'Enabled' : 'Disabled'} · ${String(row.calls.length)} actions`}
          onPress={() => {
            select(row.id);
          }}
        />
      ))}
    </List>
  );
}
function WebhookList({
  rows,
  select,
}: {
  readonly rows: readonly WebhookRow[] | undefined;
  readonly select: (id: number) => void;
}): ReactNode {
  return (
    <List title="On-device actions">
      {rows?.map((row) => (
        <NavRow
          key={row.id}
          title={row.name ?? row.event}
          subtitle={`${row.enable === true ? 'Enabled' : 'Disabled'} · ${row.event}`}
          onPress={() => {
            select(row.id);
          }}
        />
      ))}
    </List>
  );
}
function ResourceState({ count }: { readonly count: number | undefined }): ReactNode {
  return count === undefined ? (
    <Text tone="variant">Inventory unavailable. Refresh the sensor.</Text>
  ) : count === 0 ? (
    <Text tone="variant">No entries yet.</Text>
  ) : null;
}

export function ScheduleSettings({ sensor }: { readonly sensor: ShellyPresenceDevice }): ReactNode {
  const params = useLocalSearchParams<{ readonly focus?: string; readonly item?: string }>();
  const [selected, select] = usePresenceSelection('item', params.focus === 'create' ? 'new' : null);
  const resources = sensor.resources;
  const schedules = resources?.schedules;
  const rows = schedules?.jobs;
  if (selected !== null) {
    const row = resourceRow(rows, selected);
    const close = (): void => {
      select(null);
    };
    return row === undefined ? (
      <MissingResource title="This schedule is no longer available." close={close} />
    ) : (
      <ScheduleEditor key={selected} sensor={sensor} row={row} close={close} />
    );
  }
  return (
    <View className="gap-section-gap">
      <Text tone="variant">Runs on this Shelly</Text>
      <ScheduleList
        rows={rows}
        select={(id) => {
          select(String(id));
        }}
      />
      <Button
        label="Add schedule"
        icon="plus"
        variant="tonal"
        disabled={!presenceActionAvailable(sensor, 'schedule_create')}
        onPress={() => {
          select('new');
        }}
      />
      <ResourceState count={rows?.length} />
      <DeleteAll
        sensor={sensor}
        kind="schedule"
        revision={schedules?.rev}
        empty={(rows?.length ?? 0) === 0}
      />
    </View>
  );
}

export function WebhookSettings({ sensor }: { readonly sensor: ShellyPresenceDevice }): ReactNode {
  const params = useLocalSearchParams<{ readonly focus?: string; readonly item?: string }>();
  const [selected, select] = usePresenceSelection('item', params.focus === 'create' ? 'new' : null);
  const resources = sensor.resources;
  const webhooks = resources?.webhooks;
  const rows = webhooks?.hooks;
  if (selected !== null) {
    const row = resourceRow(rows, selected);
    const close = (): void => {
      select(null);
    };
    return row === undefined ? (
      <MissingResource title="This action is no longer available." close={close} />
    ) : (
      <WebhookEditor key={selected} sensor={sensor} row={row} close={close} />
    );
  }
  return (
    <View className="gap-section-gap">
      <WebhookList
        rows={rows}
        select={(id) => {
          select(String(id));
        }}
      />
      <Button
        label="Add action"
        icon="plus"
        variant="tonal"
        disabled={!presenceActionAvailable(sensor, 'webhook_create')}
        onPress={() => {
          select('new');
        }}
      />
      <ResourceState count={rows?.length} />
      <DeleteAll
        sensor={sensor}
        kind="webhook"
        revision={webhooks?.rev}
        empty={(rows?.length ?? 0) === 0}
      />
    </View>
  );
}

function MissingResource({
  title,
  close,
}: {
  readonly title: string;
  readonly close: () => void;
}): ReactNode {
  return (
    <View className="gap-3">
      <Text>{title}</Text>
      <Button label="Back" variant="text" onPress={close} />
    </View>
  );
}
function DeleteAll({
  sensor,
  kind,
  revision,
  empty,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly kind: 'schedule' | 'webhook';
  readonly revision: number | undefined;
  readonly empty: boolean;
}): ReactNode {
  return empty ? null : (
    <PresenceActionButton
      sensor={sensor}
      label={kind === 'schedule' ? 'Delete all schedules' : 'Delete all actions'}
      action={{
        action: kind === 'schedule' ? 'schedule_delete_all' : 'webhook_delete_all',
        ...(revision === undefined ? {} : { expectedRevision: revision }),
      }}
    />
  );
}

function resourceRow<T extends { readonly id: number }>(
  rows: readonly T[] | undefined,
  selected: string,
): T | null | undefined {
  return selected === 'new' ? null : rows?.find((item) => String(item.id) === selected);
}
