import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { Href } from 'expo-router';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { stateCopy, type StateCopy } from './player-copy';
import type { PlayerState } from './player-state';

type FirewallFix = { readonly kind: 'here'; readonly href: Href } | { readonly kind: 'elsewhere' };

export interface StateActions {
  readonly retry: () => void;
  readonly restart: (() => void) | null;
  readonly fix: FirewallFix;
  readonly setUpRemote: Href;
  readonly watchThroughServer: (() => void) | null;
  readonly watchDirectly: () => void;
  readonly turnOffPrivacy: (() => void) | null;
}

export interface PlayerStateViewProps {
  readonly state: PlayerState;
  readonly name: string;
  readonly timeZone: string;
  readonly now: number;
  readonly actions: StateActions;
  readonly compact: boolean;
  readonly underBar?: boolean;
  readonly muted?: boolean;
}

interface Action {
  readonly label: string;
  readonly onPress?: () => void;
  readonly href?: Href;
}

function withAction(actions: readonly (Action | null)[]): readonly Action[] {
  return actions.filter((action): action is Action => action !== null);
}

function failedActions(
  state: Extract<PlayerState, { kind: 'failed' }>,
  actions: StateActions,
): readonly Action[] {
  if (state.reason === 'relayUnsupported') {
    return [{ label: 'Watch directly', onPress: actions.watchDirectly }];
  }
  return state.reason === 'noStream' ? [] : [{ label: 'Try again', onPress: actions.retry }];
}

function optional(label: string, onPress: (() => void) | null): Action | null {
  return onPress === null ? null : { label, onPress };
}

function actionsOf(state: PlayerState, actions: StateActions): readonly Action[] {
  switch (state.kind) {
    case 'noVideo':
      return withAction([
        { label: 'Try again', onPress: actions.retry },
        optional('Restart camera', actions.restart),
      ]);
    case 'privacy':
      return withAction([optional('Turn off', actions.turnOffPrivacy)]);
    case 'blockedByFirewall':
      return actions.fix.kind === 'here' ? [{ label: 'Fix', href: actions.fix.href }] : [];
    case 'awayNeedsSetup':
      return withAction([
        { label: 'Set up', href: actions.setUpRemote },
        optional('Watch through your server', actions.watchThroughServer),
      ]);
    case 'failed':
      return failedActions(state, actions);
    case 'connecting':
    case 'live':
    case 'offline':
      return [];
  }
}

function bodyOf(state: PlayerState, copy: StateCopy, actions: StateActions): string | null {
  if (state.kind === 'blockedByFirewall' && actions.fix.kind === 'elsewhere') {
    return 'Fix it in the SmartEverything app on your computer.';
  }
  return copy.body;
}

function Mark({
  copy,
  compact,
}: {
  readonly copy: StateCopy;
  readonly compact: boolean;
}): ReactNode {
  if (copy.icon === 'loader') {
    return (
      <ActivityIndicator size={compact ? 'small' : 'large'} colorClassName="accent-on-surface" />
    );
  }
  return (
    <Icon name={copy.icon} size={compact ? 24 : 40} tone={copy.critical ? 'critical' : 'variant'} />
  );
}

function Copy({
  copy,
  body,
  compact,
}: {
  readonly copy: StateCopy;
  readonly body: string | null;
  readonly compact: boolean;
}): ReactNode {
  return (
    <View className="max-w-dialog items-center gap-1">
      <Text
        variant={compact ? 'body-strong' : 'title-3'}
        align="center"
        numberOfLines={compact ? 1 : 3}
      >
        {copy.title}
      </Text>
      {body === null || compact ? null : (
        <Text variant="callout" tone="variant" align="center" numberOfLines={2}>
          {body}
        </Text>
      )}
    </View>
  );
}

function Buttons({ buttons }: { readonly buttons: readonly Action[] }): ReactNode {
  if (buttons.length === 0) {
    return null;
  }
  return (
    <View className="flex-row flex-wrap justify-center gap-2">
      {buttons.map((button, index) => (
        <Button
          key={button.label}
          label={button.label}
          variant={index === 0 ? 'filled' : 'tonal'}
          {...(button.onPress === undefined ? {} : { onPress: button.onPress })}
          {...(button.href === undefined ? {} : { href: button.href })}
        />
      ))}
    </View>
  );
}

function overlayOf(state: PlayerState, muted: boolean): string | null {
  if (muted) {
    return null;
  }
  return state.kind === 'connecting' ? 'bg-black/30' : 'bg-black/70';
}

export function PlayerStateView(props: PlayerStateViewProps): ReactNode {
  const { state, actions, compact } = props;
  const copy = stateCopy(state, { name: props.name, timeZone: props.timeZone, now: props.now });
  if (copy === null) {
    return null;
  }
  const body = bodyOf(state, copy, actions);
  const buttons = compact ? [] : actionsOf(state, actions).slice(0, 2);
  const quiet = compact && state.kind === 'connecting';
  return (
    <View
      accessibilityLiveRegion="polite"
      className={cn(
        'absolute inset-0 items-center justify-center',
        compact ? 'gap-1.5 px-3 pb-9' : 'gap-3 px-6',
        overlayOf(state, props.muted === true),
      )}
    >
      <Mark copy={copy} compact={compact} />
      {quiet ? null : <Copy copy={copy} body={body} compact={compact} />}
      <Buttons buttons={buttons} />
    </View>
  );
}
