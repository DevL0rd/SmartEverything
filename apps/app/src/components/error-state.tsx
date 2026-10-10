import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { errorText } from '../format/errors';
import { Button } from './button';
import { Icon } from './icon';
import { Text } from './text';

export interface ErrorStateProps {
  readonly error: unknown;
  readonly retry?: () => void;
  readonly retryLabel?: string;
  readonly page?: boolean;
}

export function ErrorState({
  error,
  retry,
  retryLabel = 'Try again',
  page = false,
}: ErrorStateProps): ReactNode {
  const text = errorText(error);
  return (
    <View
      accessibilityRole="alert"
      className={cn(
        'gap-2',
        page ? 'items-center self-center px-6 py-12' : 'flex-row items-start py-2',
      )}
    >
      <Icon name="alert" size={page ? 40 : 20} tone="critical" />
      <View className={cn('min-w-0 gap-1', page ? 'items-center' : 'flex-1')}>
        <Text variant="body-strong" align={page ? 'center' : 'start'}>
          {text.title}
        </Text>
        <Text
          variant="footnote"
          tone="variant"
          align={page ? 'center' : 'start'}
          numberOfLines={3}
          selectable
        >
          {text.detail}
        </Text>
      </View>
      {retry === undefined ? null : <Button label={retryLabel} variant="tonal" onPress={retry} />}
    </View>
  );
}
