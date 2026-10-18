import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DeviceLogCause } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { CAUSE_LOOKS, causeText } from './log-model';

export const CauseChip = memo(function CauseChip({
  cause,
}: {
  readonly cause: DeviceLogCause;
}): ReactNode {
  return (
    <View className="shrink flex-row items-center gap-1">
      <Icon name={CAUSE_LOOKS[cause.kind].icon} size={16} tone="variant" />
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {causeText(cause)}
      </Text>
    </View>
  );
});
