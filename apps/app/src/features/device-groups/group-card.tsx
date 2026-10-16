import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../components/card';
import { Button } from '../../components/button';
import { Text } from '../../components/text';
import type { Device } from '../../store/state';
import { groupControlChoices } from './model';
import { GroupControl } from './group-control';

export function DeviceGroupCard({
  devices,
  title,
  onEdit,
}: {
  readonly devices: readonly Device[];
  readonly title: string;
  readonly onEdit?: () => void;
}): ReactNode {
  const controls = groupControlChoices(devices);
  const power = controls.find((choice) => choice.presented.role === 'power');
  const others = controls.filter((choice) => choice !== power);
  return (
    <Card
      title={title}
      icon="bulb"
      action={
        <View className="flex-row items-center gap-2">
          {power === undefined ? null : <GroupControl devices={devices} choice={power} />}
          {onEdit === undefined ? null : <Button label="Edit" variant="text" onPress={onEdit} />}
        </View>
      }
    >
      <Text
        variant="callout"
        tone="variant"
      >{`${String(devices.length)} devices · ${String(devices.filter((device) => device.online).length)} online`}</Text>
      <View className="flex-row flex-wrap gap-3">
        {others.map((choice) => (
          <View
            key={choice.reference}
            className="w-full min-w-0 medium:w-auto medium:min-w-64 medium:flex-1"
          >
            <GroupControl devices={devices} choice={choice} />
          </View>
        ))}
      </View>
      {controls.length === 0 ? (
        <Text variant="callout" tone="variant">
          These devices have no shared controls.
        </Text>
      ) : null}
    </Card>
  );
}
