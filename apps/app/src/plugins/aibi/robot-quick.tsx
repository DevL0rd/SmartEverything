import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../components/text';
import type { Device } from '../../store/state';
import { QuickMoveButton } from './robot-actions';
import { quickMoves } from './move-model';
import { useRobotLive } from './use-robot-card';

const QUICK_COUNT = 4;

export function RobotQuickLine({ device }: { readonly device: Device }): ReactNode {
  const live = useRobotLive(device);
  return live === null ? null : (
    <Text variant="callout" tone="variant" numberOfLines={1}>
      {live.view.words}
    </Text>
  );
}

export function RobotQuick({ device }: { readonly device: Device }): ReactNode {
  const live = useRobotLive(device);
  const moves = live?.moves ?? null;
  if (live === null || moves === null) {
    return null;
  }
  if (live.view.problem) {
    return null;
  }
  if (live.view.asleep) {
    return (
      <Text variant="footnote" tone="variant">
        Moves wait until AIBI wakes up.
      </Text>
    );
  }
  return (
    <View className="flex-row flex-wrap gap-2">
      {quickMoves(moves.actions, QUICK_COUNT).map((move) => (
        <QuickMoveButton key={move.id} device={device} move={move} />
      ))}
    </View>
  );
}
