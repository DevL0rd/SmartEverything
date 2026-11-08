import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { cn } from '../../../design/cn';
import type { ParticipantInk } from '../model/participant';
import { INK_MENTION, INK_TEXT, SELF_MENTION } from './chat-surface';

export function mentionClass(ink: ParticipantInk, self: boolean): string {
  return cn(
    'rounded-xs web:px-0.75',
    self ? SELF_MENTION : cn('font-sans-medium', INK_TEXT[ink], INK_MENTION[ink]),
  );
}

export function MentionChip({
  text,
  ink,
  self,
  onPress,
}: {
  readonly text: string;
  readonly ink: ParticipantInk;
  readonly self: boolean;
  readonly onPress?: () => void;
}): ReactNode {
  return (
    <Text
      accessibilityRole={onPress === undefined ? 'text' : 'button'}
      suppressHighlighting
      {...(onPress === undefined ? {} : { onPress })}
      className={mentionClass(ink, self)}
    >
      {text}
    </Text>
  );
}
