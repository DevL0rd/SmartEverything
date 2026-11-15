import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../../components/text';
import { playTime } from '../../../../format/time';
import { useSecondOf } from '../../../../store/clock';
import { callActive, type CallView } from '../call-state';
import { sublineOf, statusOf } from '../model/call-copy';

const SECOND_MS = 1000;

export interface CallStatusProps {
  readonly call: CallView;
  readonly name: string;
  readonly hidden?: boolean;
}

export function CallStatus({ call, name, hidden = false }: CallStatusProps): ReactNode {
  const active = callActive(call);
  const { startedAt } = call;
  const elapsed = useSecondOf(
    (now) => (startedAt === null ? playTime(0) : playTime((now - startedAt) / SECOND_MS)),
    active,
  );
  const status = statusOf(call, name);
  if (hidden) {
    return (
      <View className="h-0 overflow-hidden" accessible accessibilityLiveRegion="polite">
        <Text>{status}</Text>
      </View>
    );
  }
  return (
    <View className="items-center gap-1">
      <Text variant="title-2" align="center" accessibilityLiveRegion="polite">
        {status}
      </Text>
      <Text variant="footnote" tone="variant" align="center">
        {sublineOf(call, name, elapsed)}
      </Text>
    </View>
  );
}
