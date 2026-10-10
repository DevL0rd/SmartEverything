import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../../components/text';
import { callActive, type CallView } from '../call-state';
import { useElapsed } from './use-elapsed';

const ENDINGS = {
  hung_up: 'Call ended',
  finished: 'Call ended',
  idle: 'Ended after a quiet minute',
  failed: 'Call didn’t work',
  replaced: 'Moved to another call',
  disconnected: 'Connection lost',
} as const;

function statusOf(call: CallView, name: string): string {
  switch (call.phase) {
    case 'idle':
    case 'connecting':
      return 'Connecting…';
    case 'listening':
      return call.muted ? 'Muted' : 'Listening';
    case 'thinking':
      return 'Working on it…';
    case 'speaking':
      return name;
    case 'ended':
      return call.ending === null ? 'Call ended' : ENDINGS[call.ending];
  }
}

export function CallStatus({
  call,
  name,
}: {
  readonly call: CallView;
  readonly name: string;
}): ReactNode {
  const active = callActive(call);
  const elapsed = useElapsed(call.startedAt, active);
  return (
    <View className="items-center gap-1">
      <Text variant="title-2" align="center">
        {statusOf(call, name)}
      </Text>
      <Text variant="footnote" tone="variant" align="center">
        {active ? `${name} · ${elapsed}` : (call.problem ?? name)}
      </Text>
    </View>
  );
}
