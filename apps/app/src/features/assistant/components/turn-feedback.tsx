import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { AiChatRow, AssistantMessageRow } from '@smarteverything/domain';
import { COLLAPSE_LAYOUT } from '../../../components/disclosure';
import { Text } from '../../../components/text';
import { useMotion } from '../../../design/motion';
import { useTurnFeedback } from '../data/turn-feedback';
import { feedbackTone } from '../model/turn-feedback';
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
  if (feedback === null) return null;
  const tone = feedbackTone(feedback);
  return (
    <Animated.View
      {...(motion.reduced ? {} : { layout: COLLAPSE_LAYOUT })}
      className="w-full max-w-reading self-center py-2"
    >
      <View
        accessible
        accessibilityLabel={feedback.label}
        accessibilityLiveRegion="polite"
        className="flex-row items-center gap-2"
      >
        <Text variant="caption" tone={tone}>
          {feedback.label}
        </Text>
        <TypingDots tone={tone === 'critical' ? 'critical' : 'primary'} moving={feedback.moving} />
      </View>
    </Animated.View>
  );
}
