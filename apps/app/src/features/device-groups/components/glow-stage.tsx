import type { ReactNode } from 'react';
import { memo } from 'react';
import { View, type ViewStyle } from 'react-native';
import type { TargetState } from '@smarteverything/domain';
import { HScroller } from '../../../components/h-scroller';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import type { MemberNoun } from '../group-summary';
import {
  BULB_WIDTH,
  bulbCaption,
  bulbLabel,
  haloOf,
  stageChips,
  stageLabel,
  type StageMember,
} from '../model/stage';

const WASH_OPACITY = 0.1;

function washStyle(wash: string): { backgroundColor: string; opacity: number } {
  return { backgroundColor: wash, opacity: WASH_OPACITY };
}

function bulbBox(pointer: boolean): ViewStyle {
  return { width: BULB_WIDTH[pointer ? 'pointer' : 'touch'] };
}

const BulbMark = memo(function BulbMark({ member }: { readonly member: StageMember }): ReactNode {
  if (member.mark === 'failed')
    return (
      <View className="absolute right-0 top-0" aria-hidden>
        <Icon name="warning" size={16} colour="warning" />
      </View>
    );
  if (member.mark === 'pending')
    return <View aria-hidden className="absolute right-2 top-2 size-2 rounded-full bg-primary" />;
  return null;
});

function ringClass(member: StageMember): string {
  if (member.power === 'offline') return 'border-dashed border-on-surface-variant';
  return member.power === 'off' ? 'border-on-surface-variant' : 'border-outline-variant';
}

function Halo({
  member,
  pointer,
}: {
  readonly member: StageMember;
  readonly pointer: boolean;
}): ReactNode {
  if (member.power !== 'on' || member.colour === null) return null;
  const halo = haloOf(member.level, pointer);
  const style = {
    width: halo.size,
    height: halo.size,
    opacity: halo.opacity,
    backgroundColor: member.colour,
  };
  return <View className="absolute rounded-full" style={style} pointerEvents="none" />;
}

function BulbArt({
  member,
  pointer,
}: {
  readonly member: StageMember;
  readonly pointer: boolean;
}): ReactNode {
  return (
    <View className={cn('items-center justify-center', pointer ? 'size-20' : 'size-18')}>
      <Halo member={member} pointer={pointer} />
      <View
        className={cn(
          'absolute rounded-full border-hairline',
          pointer ? 'size-14' : 'size-12',
          ringClass(member),
        )}
        pointerEvents="none"
      />
      <Icon
        name={member.light ? 'bulb' : 'plug'}
        size={pointer ? 28 : 24}
        colour={member.power === 'on' ? 'on-surface' : 'on-surface-variant'}
      />
      <BulbMark member={member} />
    </View>
  );
}

const Bulb = memo(function Bulb({
  member,
  pointer,
  onPick,
}: {
  readonly member: StageMember;
  readonly pointer: boolean;
  readonly onPick: (deviceId: string) => void;
}): ReactNode {
  return (
    <Interactive
      label={bulbLabel(member)}
      onPress={() => {
        onPick(member.id);
      }}
      className="items-center gap-0.5 rounded-md py-1"
      style={bulbBox(pointer)}
      layerClassName="rounded-md"
    >
      <BulbArt member={member} pointer={pointer} />
      <Text
        variant="caption"
        align="center"
        numberOfLines={2}
        className="min-h-8"
        tone={member.power === 'on' ? 'default' : 'variant'}
      >
        {member.name}
      </Text>
      <Text variant="caption" tone="variant" className="tabular">
        {bulbCaption(member)}
      </Text>
    </Interactive>
  );
});

function Head({
  state,
  chips,
}: {
  readonly state: TargetState;
  readonly chips: readonly string[];
}): ReactNode {
  return (
    <View className="flex-row flex-wrap items-end justify-between gap-x-3 gap-y-1">
      <View className="flex-row items-end gap-1.5">
        <Text
          variant="title-1"
          className="tabular"
        >{`${String(state.on)} of ${String(state.members)}`}</Text>
        <Text variant="callout" tone="variant" className="pb-1">
          on
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-1.5">
        {chips.map((chip) => (
          <View key={chip} className="rounded-full bg-surface-2 px-2.5 py-1">
            <Text variant="footnote" className="tabular">
              {chip}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function GlowStage({
  name,
  noun,
  state,
  members,
  wash,
  onPick,
  children,
}: {
  readonly name: string;
  readonly noun: MemberNoun;
  readonly state: TargetState;
  readonly members: readonly StageMember[];
  readonly wash: string | null;
  readonly onPick: (deviceId: string) => void;
  readonly children?: ReactNode;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <View
      role="group"
      aria-label={stageLabel(name, state, noun)}
      className="gap-3 overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1 p-3"
    >
      {wash === null ? null : (
        <View className="absolute inset-0" style={washStyle(wash)} pointerEvents="none" />
      )}
      <Head state={state} chips={stageChips(state)} />
      <HScroller label={`${name} members`} fade>
        {members.map((member) => (
          <Bulb key={member.id} member={member} pointer={pointer} onPick={onPick} />
        ))}
      </HScroller>
      {children}
    </View>
  );
}
