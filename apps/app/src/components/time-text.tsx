import type { ReactNode } from 'react';
import { clock } from '../format/time';
import { Text, type TextVariant } from './text';
import type { Tone } from './tone';

interface TimeTextProps {
  readonly at: Date | string;
  readonly now: number;
  readonly variant?: TextVariant;
  readonly tone?: Tone;
}

export function ClockTextView({
  at,
  timeZone,
  variant = 'body',
  tone = 'default',
}: Omit<TimeTextProps, 'now'> & { readonly timeZone: string | null }): ReactNode {
  return (
    <Text variant={variant} tone={tone} numberOfLines={1}>
      {clock(at, timeZone)}
    </Text>
  );
}
