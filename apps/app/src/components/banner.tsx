import type { ReactNode, Ref } from 'react';
import { View } from 'react-native';
import type { AppHref } from './app-href';
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
  readonly ref?: Ref<View>;
  readonly label: string;
  readonly spoken?: string;
  readonly onPress?: () => void;
  readonly href?: AppHref;
  readonly variant?: 'text' | 'filled' | 'tonal' | 'outlined';
  readonly icon?: IconName;
  readonly loading?: boolean;
}

export interface BannerProps {
  readonly tone: StatusTone;
  readonly title: string;
  readonly body?: string;
  readonly wrapBody?: boolean;
  readonly announceTitle?: boolean;
  readonly appearance?: 'card' | 'shell';
  readonly action?: BannerAction;
  readonly onDismiss?: () => void;
  readonly secondaryAction?: BannerAction;
  readonly children?: ReactNode;
}

function BannerText({
  title,
  body,
  wrapBody,
  compact = false,
  announceTitle = false,
}: {
  readonly title: string;
  readonly body: string | undefined;
  readonly wrapBody: boolean;
  readonly compact?: boolean;
  readonly announceTitle?: boolean;
}): ReactNode {
  return (
    <View
      className={cn(
        'flex-1 py-1',
        compact ? 'min-w-0' : body === undefined ? 'min-w-24' : 'min-w-40',
      )}
    >
      <Text
        variant={compact ? 'label' : 'body-strong'}
        {...(announceTitle ? { accessibilityLiveRegion: 'polite', 'aria-live': 'polite' } : {})}
      >
        {title}
      </Text>
      {body === undefined ? null : (
        <Text
          variant={compact ? 'footnote' : 'callout'}
          tone="variant"
          {...(wrapBody ? {} : { numberOfLines: 1 })}
        >
          {body}
        </Text>
      )}
    </View>
  );
}

function BannerButton({
  action,
  wrap,
}: {
  readonly action: BannerAction;
  readonly wrap: boolean;
}): ReactNode {
  return (
    <Button
      label={action.label}
      wrap={wrap}
      {...(action.spoken === undefined ? {} : { spoken: action.spoken })}
      {...(action.ref === undefined ? {} : { ref: action.ref })}
      variant={action.variant ?? 'text'}
      {...(action.icon === undefined ? {} : { icon: action.icon })}
      {...(action.loading === true ? { loading: true } : {})}
      {...(action.onPress === undefined ? {} : { onPress: action.onPress })}
      {...(action.href === undefined ? {} : { href: action.href })}
    />
  );
}

function BannerTrailing({
  action,
  secondaryAction,
  onDismiss,
  wrap,
}: {
  readonly action: BannerAction | undefined;
  readonly secondaryAction: BannerAction | undefined;
  readonly onDismiss: (() => void) | undefined;
  readonly wrap: boolean;
}): ReactNode {
  if (action === undefined && secondaryAction === undefined && onDismiss === undefined) return null;
  return (
    <View
      className={cn(
        'ml-auto shrink-0 flex-row items-center gap-1',
        wrap && 'max-w-full flex-wrap justify-end',
      )}
    >
      {secondaryAction === undefined ? null : <BannerButton action={secondaryAction} wrap={wrap} />}
      {action === undefined ? null : <BannerButton action={action} wrap={wrap} />}
      {onDismiss === undefined ? null : (
        <IconButton icon="close" label="Dismiss" onPress={onDismiss} />
      )}
    </View>
  );
}

function ShellBannerText({
  tone,
  title,
  body,
  wrapBody,
  announceTitle,
}: Pick<BannerProps, 'tone' | 'title'> & {
  readonly body: string | undefined;
  readonly wrapBody: boolean;
  readonly announceTitle: boolean;
}): ReactNode {
  return (
    <View className="min-w-36 flex-1 flex-row items-center gap-2">
      <Icon
        name={tone === 'info' ? 'download' : ICON[tone]}
        size={16}
        tone={tone === 'info' ? 'primary' : tone}
      />
      <BannerText
        title={title}
        body={body}
        wrapBody={wrapBody}
        announceTitle={announceTitle}
        compact
      />
    </View>
  );
}

export function Banner({
  tone,
  title,
  body,
  wrapBody = false,
  announceTitle = false,
  appearance = 'card',
  action,
  secondaryAction,
  onDismiss,
  children,
}: BannerProps): ReactNode {
  const compact = appearance === 'shell';
  return (
    <View
      accessibilityRole={tone === 'critical' ? 'alert' : 'summary'}
      className={cn(
        'flex-row flex-wrap items-center gap-y-1',
        compact ? 'gap-x-2 py-1' : cn('gap-x-3 rounded-lg py-2 pl-4 pr-2', STATUS_CONTAINER[tone]),
      )}
    >
      {compact ? (
        <ShellBannerText
          tone={tone}
          title={title}
          body={body}
          wrapBody={wrapBody}
          announceTitle={announceTitle}
        />
      ) : (
        <>
          <Icon name={ICON[tone]} size={20} tone={tone} />
          <BannerText title={title} body={body} wrapBody={wrapBody} />
        </>
      )}
      <BannerTrailing
        action={action}
        secondaryAction={secondaryAction}
        onDismiss={onDismiss}
        wrap={compact}
      />
      {children === undefined ? null : <View className="w-full pb-2 pr-2">{children}</View>}
    </View>
  );
}
