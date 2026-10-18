import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { outcomeWon, type ClaimOutcome } from './contest-model';

export function NumberDot({
  number,
  outcome,
}: {
  readonly number: number;
  readonly outcome: ClaimOutcome;
}): ReactNode {
  const won = outcomeWon(outcome);
  return (
    <View
      aria-hidden
      className={cn(
        'size-6 items-center justify-center rounded-full',
        won ? 'bg-primary' : 'border bg-surface-1',
        !won && (outcome === 'late' ? 'border-on-surface-faint' : 'border-on-surface-variant'),
      )}
    >
      <Text variant="caption" tone={won ? 'onPrimary' : 'variant'}>
        {String(number)}
      </Text>
    </View>
  );
}
