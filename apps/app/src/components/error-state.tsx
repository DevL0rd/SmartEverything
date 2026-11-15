import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { errorText, type ErrorText } from '../format/errors';
import { Button } from './button';
import { Icon } from './icon';
import { Text } from './text';

export interface ErrorStateAction {
  readonly label: string;
  readonly onPress: () => void;
}

export interface ErrorStateProps {
  readonly error: unknown;
  readonly title?: string;
  readonly retry?: () => void;
  readonly retryLabel?: string;
  readonly secondary?: ErrorStateAction;
  readonly page?: boolean;
  readonly wrapDetail?: boolean;
}

function textOf(error: unknown, title: string | undefined): ErrorText {
  const reason = errorText(error);
  return title === undefined ? reason : { title, detail: `${reason.title} ${reason.detail}` };
}

function ErrorActions({
  retry,
  retryLabel,
  secondary,
  page,
}: {
  readonly retry: (() => void) | undefined;
  readonly retryLabel: string;
  readonly secondary: ErrorStateAction | undefined;
  readonly page: boolean;
}): ReactNode {
  if (retry === undefined && secondary === undefined) return null;
  return (
    <View
      testID="error-state-actions"
      className={cn('flex-row flex-wrap items-center gap-2', page && 'justify-center pt-2')}
    >
      {retry === undefined ? null : <Button label={retryLabel} variant="tonal" onPress={retry} />}
      {secondary === undefined ? null : (
        <Button label={secondary.label} variant="text" onPress={secondary.onPress} />
      )}
    </View>
  );
}

export function ErrorState({
  error,
  title,
  retry,
  retryLabel = 'Try again',
  secondary,
  page = false,
  wrapDetail,
}: ErrorStateProps): ReactNode {
  const text = textOf(error, title);
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
          {...(wrapDetail === true ? {} : { numberOfLines: 3 })}
          selectable
        >
          {text.detail}
        </Text>
      </View>
      <ErrorActions retry={retry} retryLabel={retryLabel} secondary={secondary} page={page} />
    </View>
  );
}
