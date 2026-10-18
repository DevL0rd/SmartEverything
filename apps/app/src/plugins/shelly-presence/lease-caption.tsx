import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyDevice } from '@smarteverything/shelly';
import { Button } from '../../components/button';
import { Text } from '../../components/text';
import type { TrackingLease } from './use-tracking-lease';

export function LeaseCaption({
  sensor,
  lease,
}: {
  readonly sensor: ShellyDevice;
  readonly lease: TrackingLease;
}): ReactNode {
  if (lease.failed !== null)
    return (
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="caption" tone="critical" className="flex-1">
          Couldn’t start live view
        </Text>
        <Button label="Retry" icon="refresh" variant="text" onPress={lease.retry} />
      </View>
    );
  if (lease.support === 'offline')
    return (
      <Text variant="caption" tone="variant">
        The map shows the last known layout.
      </Text>
    );
  return lease.support === 'unsupported' ? (
    <Text variant="caption" tone="variant">
      Live view isn’t supported on {sensor.name}.
    </Text>
  ) : null;
}
