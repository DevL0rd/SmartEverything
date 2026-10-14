import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { AiChatRow, AssistantMessageRow } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { useMotion } from '../../../design/motion';
import { useTurnFeedback } from '../data/turn-feedback';
import { WORK_COLLAPSE } from './thread-motion';
import { TypingDots } from './typing-dots';

export function TurnFeedback({
  chat,
  rows,
}: {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
}): ReactNode {
  const feedback = useTurnFeedback(chat, rows);
  const motion = useMotion();
  const reconnecting = feedback?.label === 'Reconnecting…';
  if (feedback === null) return null;
  return (
    <Animated.View
      {...(motion.reduced ? {} : { layout: WORK_COLLAPSE })}
      className="w-full max-w-reading self-center py-2"
    >
      <View
        accessible
        accessibilityLabel={feedback.label}
        accessibilityLiveRegion="polite"
        className="flex-row items-center gap-2"
      >
        <Text variant="caption" tone={reconnecting ? 'critical' : 'variant'}>
          {feedback.label}
        </Text>
        <TypingDots tone={reconnecting ? 'critical' : 'primary'} moving={feedback.moving} />
      </View>
    </Animated.View>
  );
}
