import type { ReactNode } from 'react';
import { View } from 'react-native';
import { presentValue } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { joinParts, plural } from '../../../format/text';
import { useDeviceValues } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { Guard, offlineReason } from '../controls/guard';
import { useAction } from '../controls/use-action';
import { useDisplayName } from '../model/display-name';
import { valueOf, useDeviceModel } from '../model/device-model';
import {
  maintenanceOf,
  type ActionItem,
  type FilterItem,
  type StatusItem,
} from '../model/maintenance';

const LOW_FILTER = 20;

function FilterBar({ share }: { readonly share: number }): ReactNode {
  const filled = Math.max(0, Math.min(100, share));
  const used = { flexGrow: filled };
  const left = { flexGrow: 100 - filled };
  return (
    <View className="h-2 flex-row overflow-hidden rounded-full bg-surface-3">
      <View
        style={used}
        className={cn('h-2 rounded-full', share < LOW_FILTER ? 'bg-warning' : 'bg-positive')}
      />
      <View style={left} />
    </View>
  );
}

function ActionButton({
  device,
  item,
  reason,
}: {
  readonly device: Device;
  readonly item: Pick<ActionItem, 'presented'>;
  readonly reason: string | null;
}): ReactNode {
  const action = useAction(device, item.presented);
  return (
    <Guard reason={reason}>
      <Button
        label={
          item.presented.danger.tier === 'none' ? item.presented.label : `${item.presented.label}…`
        }
        variant="tonal"
        loading={action.pending}
        disabled={reason !== null}
        onPress={action.run}
      />
      {action.sheet}
    </Guard>
  );
}

function FilterRow({
  device,
  item,
  reason,
}: {
  readonly device: Device;
  readonly item: FilterItem;
  readonly reason: string | null;
}): ReactNode {
  const days = item.daysLeft === null ? null : `about ${plural(item.daysLeft, 'day')} left`;
  return (
    <View className="gap-3">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text variant="body-strong">{item.life.label}</Text>
        <Text variant="callout" tone="variant" className="tabular">
          {joinParts([presentValue(item.life, item.lifeValue), days])}
        </Text>
      </View>
      <FilterBar share={item.lifeValue} />
      {item.reset === null ? null : (
        <View className="flex-row">
          <ActionButton device={device} item={{ presented: item.reset }} reason={reason} />
        </View>
      )}
    </View>
  );
}

function StatusRow({
  item,
  deviceId,
}: {
  readonly item: StatusItem;
  readonly deviceId: string;
}): ReactNode {
  const values = useDeviceValues(deviceId);
  const value = valueOf(values, item.presented);
  return (
    <View className="min-h-touch-min flex-row items-center justify-between gap-3">
      <Text variant="body">{item.presented.label}</Text>
      <Text variant="body" tone={item.fault ? 'critical' : 'variant'}>
        {value === undefined ? '' : presentValue(item.presented, value)}
      </Text>
    </View>
  );
}

export function MaintenanceCard({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  const values = useDeviceValues(device.id);
  const name = useDisplayName(device.id);
  const items = maintenanceOf(model, values);
  const reason = device.online ? null : offlineReason(name);
  if (items.length === 0) {
    return null;
  }
  const actions = items.filter((item): item is ActionItem => item.kind === 'action');
  return (
    <Card title="Maintenance" icon="wrench">
      <View className="gap-4">
        {items.map((item) => {
          if (item.kind === 'filter') {
            return <FilterRow key="filter" device={device} item={item} reason={reason} />;
          }
          return item.kind === 'status' ? (
            <StatusRow key={item.presented.key} item={item} deviceId={device.id} />
          ) : null;
        })}
        {actions.length === 0 ? null : (
          <View className="flex-row flex-wrap gap-2">
            {actions.map((item) => (
              <ActionButton key={item.presented.key} device={device} item={item} reason={reason} />
            ))}
          </View>
        )}
      </View>
    </Card>
  );
}
