import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import { cn } from '../design/cn';
import { Button } from './button';
import { Icon, type IconName } from './icon';
import { IconButton } from './icon-button';
import { Text } from './text';
import { STATUS_CONTAINER, type StatusTone } from './tone';

const ICON: Readonly<Record<StatusTone, IconName>> = {
  info: 'info',
  positive: 'circleCheck',
  warning: 'warning',
  critical: 'alert',
};

interface BannerAction {
  readonly label: string;
  readonly onPress?: () => void;
  readonly href?: Href;
}

export interface BannerProps {
  readonly tone: StatusTone;
  readonly title: string;
  readonly body?: string;
  readonly wrapBody?: boolean;
  readonly action?: BannerAction;
  readonly onDismiss?: () => void;
}

export function Banner({
  tone,
  title,
  body,
  wrapBody = false,
  action,
  onDismiss,
}: BannerProps): ReactNode {
  return (
    <View
      accessibilityRole={tone === 'critical' ? 'alert' : 'summary'}
      className={cn(
        'flex-row flex-wrap items-center gap-x-3 gap-y-1 rounded-lg py-2 pl-4 pr-2',
        STATUS_CONTAINER[tone],
      )}
    >
      <Icon name={ICON[tone]} size={20} tone={tone} />
      <View className="min-w-40 flex-1 py-1">
        <Text variant="body-strong">{title}</Text>
        {body === undefined ? null : (
          <Text variant="callout" tone="variant" {...(wrapBody ? {} : { numberOfLines: 1 })}>
            {body}
          </Text>
        )}
      </View>
      {action === undefined ? null : (
        <Button
          label={action.label}
          variant="text"
          {...(action.onPress === undefined ? {} : { onPress: action.onPress })}
          {...(action.href === undefined ? {} : { href: action.href })}
        />
      )}
      {onDismiss === undefined ? null : (
        <IconButton icon="close" label="Dismiss" onPress={onDismiss} />
      )}
    </View>
  );
}
