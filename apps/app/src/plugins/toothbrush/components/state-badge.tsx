import type { BrushActivity } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge, type BadgeTone } from '../../../components/badge';
import { useFrameSelect } from '../data/brush-data';
import { ACTIVITY_LABEL } from '../model/brush-model';
import type { BrushStateView } from '@smarteverything/domain';

const TONE: Readonly<Record<BrushActivity, BadgeTone>> = {
  asleep: 'neutral',
  standby: 'primary',
  brushing: 'positive',
  paused: 'warning',
  charging: 'info',
  off: 'neutral',
};

export function BrushStateBadge({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: BrushStateView;
}): ReactNode {
  const activity = useFrameSelect(deviceId, view.frame, (frame) => frame.activity);
  return (
    <View className="shrink-0">
      <Badge label={ACTIVITY_LABEL[activity]} tone={TONE[activity]} />
    </View>
  );
}
