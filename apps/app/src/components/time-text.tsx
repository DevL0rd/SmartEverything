import type { ReactNode } from 'react';
import { clock } from '../format/time';
import { Text, type TextVariant } from './text';
import type { Tone } from './tone';

interface ClockTextProps {
  readonly at: Date | string;
  readonly timeZone: string | null;
  readonly variant?: TextVariant;
  readonly tone?: Tone;
}

export function ClockText({
  at,
  timeZone,
  variant = 'body',
  tone = 'default',
}: ClockTextProps): ReactNode {
  return (
    <Text variant={variant} tone={tone} numberOfLines={1}>
      {clock(at, timeZone)}
    </Text>
  );
}
