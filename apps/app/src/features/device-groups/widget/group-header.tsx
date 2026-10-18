import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { TargetState } from '@smarteverything/domain';
import { IconButton } from '../../../components/icon-button';
import { IconWell } from '../../../components/icon-well';
import { SplitRing } from '../../../components/split-ring';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { plural } from '../../../format/text';
import { colourNames, groupSummary, memberNoun, type MemberNoun } from '../group-summary';
import type { Master } from '../use-master';

export function GroupGlyph({
  on,
  lights,
}: {
  readonly on: boolean;
  readonly lights: boolean;
}): ReactNode {
  const touch = useIdiom() === 'touch';
  return (
    <IconWell
      icon={lights ? 'bulbGroup' : 'layers'}
      colour={on ? 'primary' : 'on-surface-variant'}
      size={touch ? 'm' : 's'}
    />
  );
}

export function powerLabel(state: TargetState, name: string, noun: MemberNoun): string {
  if (state.power === 'none') return `No ${noun}s can be reached`;
  const all = plural(state.members, noun);
  return state.on > 0 ? `Turn off all ${all} in ${name}` : `Turn on all ${all} in ${name}`;
}

export function MasterPower({
  state,
  master,
  name,
  lights,
  onLongPress,
}: {
  readonly state: TargetState;
  readonly master: Master;
  readonly name: string;
  readonly lights: boolean;
  readonly onLongPress?: (() => void) | undefined;
}): ReactNode {
  return (
    <IconButton
      icon="power"
      label={powerLabel(state, name, memberNoun(lights))}
      variant={state.on > 0 ? 'filled' : 'tonal'}
      disabled={state.power === 'none'}
      onPress={master.togglePower}
      {...(onLongPress === undefined ? {} : { onLongPress })}
    />
  );
}

export function ColourButton({
  state,
  colours,
  name,
  onPress,
}: {
  readonly state: TargetState;
  readonly colours: readonly string[];
  readonly name: string;
  readonly onPress: () => void;
}): ReactNode {
  if ((state.support.color ?? 0) + (state.support.color_temperature ?? 0) === 0) return null;
  const mixed = state.colours.length > 1;
  return (
    <View className="items-center justify-center">
      <View className="absolute" pointerEvents="none" aria-hidden>
        <SplitRing
          colours={colours}
          size={38}
          label={mixed ? `Colours: ${colourNames(state.colours)}` : 'Colour'}
        />
      </View>
      <IconButton
        icon="palette"
        label={mixed ? `${name} colour, mixed: ${colourNames(state.colours)}` : `${name} colour`}
        disabled={state.power === 'none'}
        onPress={onPress}
      />
    </View>
  );
}

export function GroupTitle({
  name,
  state,
  lines = 1,
  strong = false,
}: {
  readonly name: string;
  readonly state: TargetState;
  readonly lines?: number;
  readonly strong?: boolean;
}): ReactNode {
  const summary = groupSummary(state);
  return (
    <View className="min-w-0 flex-1">
      <Text variant={strong ? 'body-strong' : 'title-3'} numberOfLines={lines}>
        {name}
      </Text>
      <Text variant="footnote" tone={summary.tone} numberOfLines={1}>
        {summary.text}
      </Text>
    </View>
  );
}
