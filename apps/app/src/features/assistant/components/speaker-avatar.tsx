import type { ReactNode } from 'react';
import { Text as NativeText, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Icon, type IconName } from '../../../components/icon';
import { useAnimationGate } from '../../../design/animation-gate';
import { cn } from '../../../design/cn';
import { useColour } from '../../../design/colour';
import { SPIN, loopStyle, type Loop } from '../../../design/loops';
import { useScopeVisible } from '../../../design/visibility';
import { AssistantOrb } from '../call/orb';
import {
  ASSISTANT_ID,
  type Participant,
  type ParticipantGlyph,
  type ParticipantInk,
} from '../model/participant';
import { INK_TEXT } from './chat-surface';

export type AvatarSize = 24 | 40;

const BOX: Readonly<Record<AvatarSize, string>> = { 24: 'size-6', 40: 'size-10' };

const LETTER: Readonly<Record<AvatarSize, string>> = { 24: 'text-caption', 40: 'text-title-3' };

const GLYPH_PX: Readonly<Record<AvatarSize, 16 | 20>> = { 24: 16, 40: 20 };

const RING_GAP = 3;

const RING_STROKE = 1.5;

const RING_TAIL_OPACITY = 0.4;

const RING_LOOP: Loop = { name: SPIN, ms: 1600 };

const GLYPH: Readonly<Record<ParticipantGlyph, IconName>> = {
  plugin: 'puzzle',
  camera: 'camera',
  schedule: 'clock',
};

const LETTER_FILL: Readonly<Record<ParticipantInk, string>> = {
  primary: 'bg-primary/22',
  'viz-1': 'bg-viz-1/22',
  'viz-2': 'bg-viz-2/22',
  'viz-3': 'bg-viz-3/22',
  'viz-5': 'bg-viz-5/22',
  'viz-6': 'bg-viz-6/22',
};

const AGENT_FILL: Readonly<Record<ParticipantInk, string>> = {
  primary: 'bg-primary/16',
  'viz-1': 'bg-viz-1/16',
  'viz-2': 'bg-viz-2/16',
  'viz-3': 'bg-viz-3/16',
  'viz-5': 'bg-viz-5/16',
  'viz-6': 'bg-viz-6/16',
};

function point(centre: number, radius: number, degrees: number): string {
  const radians = (degrees * Math.PI) / 180;
  const x = centre + radius * Math.cos(radians);
  const y = centre + radius * Math.sin(radians);
  return `${x.toFixed(3)} ${y.toFixed(3)}`;
}

export function ringArcs(box: number): { readonly head: string; readonly tail: string } {
  const centre = box / 2;
  const radius = centre - RING_STROKE / 2;
  const arc = (from: number, to: number): string =>
    `M ${point(centre, radius, from)} A ${String(radius)} ${String(radius)} 0 0 1 ${point(centre, radius, to)}`;
  return { head: arc(-135, -45), tail: arc(-45, 45) };
}

function LiveRing({
  size,
  ink,
}: {
  readonly size: AvatarSize;
  readonly ink: ParticipantInk;
}): ReactNode {
  const { moving } = useAnimationGate(true, useScopeVisible());
  const colour = useColour(ink);
  if (!moving) return null;
  const box = size + RING_GAP * 2;
  const arcs = ringArcs(box);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: -RING_GAP, top: -RING_GAP, width: box, height: box },
        loopStyle(RING_LOOP, moving),
      ]}
    >
      <Svg width={box} height={box}>
        <Path d={arcs.head} stroke={colour} strokeWidth={RING_STROKE} fill="none" />
        <Path
          d={arcs.tail}
          stroke={colour}
          strokeOpacity={RING_TAIL_OPACITY}
          strokeWidth={RING_STROKE}
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

function Face({
  participant,
  size,
  live,
}: {
  readonly participant: Participant;
  readonly size: AvatarSize;
  readonly live: boolean;
}): ReactNode {
  const { avatar, ink } = participant;
  if (participant.id === ASSISTANT_ID) {
    return <AssistantOrb state={live ? 'thinking' : 'idle'} size={size} paused={!live} />;
  }
  if (avatar.kind === 'letter') {
    return (
      <View className={cn('items-center justify-center rounded-full', BOX[size], LETTER_FILL[ink])}>
        <NativeText className={cn('font-sans-semibold', LETTER[size], INK_TEXT[ink])}>
          {avatar.letter}
        </NativeText>
      </View>
    );
  }
  const glyph = avatar.kind === 'agent' ? 'sparkles' : GLYPH[avatar.glyph];
  return (
    <View className={cn('items-center justify-center rounded-full', BOX[size], AGENT_FILL[ink])}>
      <Icon name={glyph} size={GLYPH_PX[size]} colour={ink} />
    </View>
  );
}

export function SpeakerAvatar({
  participant,
  live,
  size = 24,
}: {
  readonly participant: Participant;
  readonly live: boolean;
  readonly size?: AvatarSize;
}): ReactNode {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn('relative', BOX[size])}
    >
      <Face participant={participant} size={size} live={live} />
      {live ? <LiveRing size={size} ink={participant.ink} /> : null}
    </View>
  );
}
