import type { TreadmillStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge, type BadgeTone } from '../../../components/badge';
import { useLiveSelect } from '../data/treadmill-data';
import { STATE_LABEL, stateTone, type StateTone } from '../model/treadmill-model';

const BADGE_TONE: Readonly<Record<StateTone, BadgeTone>> = {
  positive: 'positive',
  warning: 'warning',
  critical: 'critical',
  neutral: 'neutral',
};

export function StateBadge({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}): ReactNode {
  const state = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.state);
  return (
    <View className="shrink-0">
      <Badge label={STATE_LABEL[state]} tone={BADGE_TONE[stateTone(state)]} />
    </View>
  );
}
