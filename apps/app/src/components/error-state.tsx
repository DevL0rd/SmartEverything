import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { useIsPhone } from '../design/size-class';
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
  if (title === undefined) return reason;
  return { title, detail: reason.detail.trim() === '' ? reason.title : reason.detail };
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

function PageErrorState({
  text,
  actions,
}: {
  readonly text: ErrorText;
  readonly actions: ReactNode;
}): ReactNode {
  return (
    <View accessibilityRole="alert" className="items-center gap-3 self-center px-6 py-12">
      <View className="size-20 items-center justify-center rounded-full bg-critical/15">
        <Icon name="alert" size={40} tone="critical" />
      </View>
      <Text variant="title-2" align="center">
        {text.title}
      </Text>
      <Text variant="body" tone="variant" align="center" className="max-w-md" selectable>
        {text.detail}
      </Text>
      {actions}
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
  const stacked = useIsPhone() && (retry !== undefined || secondary !== undefined);
  const actions = (
    <ErrorActions retry={retry} retryLabel={retryLabel} secondary={secondary} page={page} />
  );
  if (page) return <PageErrorState text={text} actions={actions} />;
  return (
    <View
      accessibilityRole="alert"
      className={cn('flex-row items-start gap-2 py-2', stacked && 'flex-wrap')}
    >
      <Icon name="alert" size={20} tone="critical" />
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="body-strong">{text.title}</Text>
        <Text
          variant="footnote"
          tone="variant"
          {...(wrapDetail === true ? {} : { numberOfLines: 3 })}
          selectable
        >
          {text.detail}
        </Text>
      </View>
      {stacked ? <View className="w-full pl-7">{actions}</View> : actions}
    </View>
  );
}
