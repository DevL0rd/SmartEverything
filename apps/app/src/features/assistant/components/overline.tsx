import type { ReactNode } from 'react';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { cn } from '../../../design/cn';

export function Overline({
  children,
  tone = 'variant',
  className,
}: {
  readonly children: ReactNode;
  readonly tone?: Tone;
  readonly className?: string;
}): ReactNode {
  return (
    <Text variant="caption" tone={tone} className={cn('uppercase tracking-widest', className)}>
      {children}
    </Text>
  );
}
