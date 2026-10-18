import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { Icon, type IconName } from './icon';
import { Text } from './text';
import { STATUS_CONTAINER, STATUS_FILL, type StatusTone } from './tone';

export type BadgeTone = StatusTone | 'neutral' | 'primary';

const FRAME: Readonly<Record<BadgeTone, string>> = {
  ...STATUS_CONTAINER,
  neutral: 'bg-surface-3',
  primary: 'bg-primary-container',
};

const TEXT_TONE = {
  info: 'info',
  positive: 'positive',
  warning: 'warning',
  critical: 'critical',
  neutral: 'variant',
  primary: 'primary',
} as const;

export interface BadgeProps {
  readonly label: string;
  readonly tone?: BadgeTone;
  readonly icon?: IconName;
}

export function Badge({ label, tone = 'neutral', icon }: BadgeProps): ReactNode {
  return (
    <View
      className={cn('flex-row items-center gap-1 self-start rounded-full px-2 py-0.5', FRAME[tone])}
    >
      {icon === undefined ? null : <Icon name={icon} size={16} tone={TEXT_TONE[tone]} />}
      <Text variant="caption" tone={TEXT_TONE[tone]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Dot({ tone }: { readonly tone: StatusTone | 'primary' }): ReactNode {
  return (
    <View
      className={cn('size-2 rounded-full', tone === 'primary' ? 'bg-primary' : STATUS_FILL[tone])}
    />
  );
}

const COUNT_CAP = 99;

function countLabel(count: number): string {
  return count > COUNT_CAP ? `${String(COUNT_CAP)}+` : String(count);
}

export function CountPill({
  count,
  label,
}: {
  readonly count: number;
  readonly label?: string;
}): ReactNode {
  if (count <= 0) {
    return null;
  }
  return (
    <View
      aria-hidden={label === undefined}
      accessibilityLabel={label}
      className="h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5"
    >
      <Text variant="caption" tone="onPrimary" className="tabular" numberOfLines={1}>
        {countLabel(count)}
      </Text>
    </View>
  );
}
