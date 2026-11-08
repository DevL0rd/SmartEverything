import type { ReactNode } from 'react';
import { Text as NativeText, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { exiting, useMotion } from '../../../design/motion';
import { AssistantOrb } from '../call/orb';
import { startsMessage } from '../data/thread';
import type { Participant, ParticipantGlyph, ParticipantInk } from '../model/participant';
import { INK_RAIL } from './chat-surface';
import { Rise } from './rise';
import { PILL_OUT, RISE_PX } from './thread-motion';
import type { ThreadRow } from './thread-rows';

export interface Jump {
  readonly count: number;
  readonly sender: Participant | null;
}

const AVATAR_PX = 24;

const HIT_SLOP = 6;

const GLYPH: Readonly<Record<ParticipantGlyph, IconName>> = {
  plugin: 'puzzle',
  camera: 'camera',
  schedule: 'clock',
};

const DISC: Readonly<Record<ParticipantInk, string>> = {
  primary: 'bg-primary/16',
  'viz-1': 'bg-viz-1/16',
  'viz-2': 'bg-viz-2/16',
  'viz-3': 'bg-viz-3/16',
  'viz-5': 'bg-viz-5/16',
  'viz-6': 'bg-viz-6/16',
};

function counted(row: ThreadRow): boolean {
  return row.type !== 'outbox' && (row.type !== 'message' || startsMessage(row));
}

function senderOf(row: ThreadRow): Participant | null {
  const message =
    row.type === 'image-operation' ? row.message : row.type === 'message' ? row : null;
  return message === null || message.speaker.kind === 'me' ? null : message.participant;
}

export function jumpOf(rows: readonly ThreadRow[], anchor: string | null): Jump {
  const fresh = rows.filter(counted);
  const at = anchor === null ? -1 : fresh.findIndex((row) => row.key === anchor);
  const unseen = fresh.slice(0, Math.max(0, at));
  let sender: Participant | null = null;
  for (const row of unseen) {
    sender = senderOf(row);
    if (sender !== null) break;
  }
  return { count: unseen.length, sender };
}

function SenderAvatar({ sender }: { readonly sender: Participant }): ReactNode {
  const { avatar, ink } = sender;
  if (sender.kind === 'assistant') return <AssistantOrb state="idle" size={AVATAR_PX} />;
  const fill = avatar.kind === 'letter' ? INK_RAIL[ink] : DISC[ink];
  return (
    <View className={cn('size-6 items-center justify-center rounded-full', fill)}>
      {avatar.kind === 'letter' ? (
        <NativeText className="font-sans-semibold text-caption text-bg">{avatar.letter}</NativeText>
      ) : (
        <Icon
          name={avatar.kind === 'agent' ? 'sparkles' : GLYPH[avatar.glyph]}
          size={16}
          colour={ink}
        />
      )}
    </View>
  );
}

function spokenOf(jump: Jump): string {
  if (jump.count === 0) return 'Jump to latest';
  const from = jump.sender === null ? '' : `, newest from ${jump.sender.name}`;
  return `Jump to ${String(jump.count)} new ${jump.count === 1 ? 'message' : 'messages'}${from}`;
}

function PillBody({ jump }: { readonly jump: Jump }): ReactNode {
  return (
    <>
      {jump.sender === null ? null : <SenderAvatar sender={jump.sender} />}
      {jump.count === 0 ? null : (
        <Text variant="caption" className="font-sans-semibold tabular">
          {String(jump.count)}
        </Text>
      )}
      <Icon name="arrowDown" size={16} tone="variant" />
    </>
  );
}

export function JumpPill({
  jump,
  onPress,
}: {
  readonly jump: Jump;
  readonly onPress: () => void;
}): ReactNode {
  const motion = useMotion();
  const rest = jump.count === 0;
  const lead = jump.sender === null ? 'pl-2.5' : 'pl-1';
  return (
    <Animated.View
      {...exiting(motion, PILL_OUT)}
      pointerEvents="box-none"
      className="absolute bottom-3 right-4"
    >
      <Rise from={RISE_PX.pill} duration={150}>
        <Interactive
          label={spokenOf(jump)}
          onPress={onPress}
          hitSlop={HIT_SLOP}
          className={cn(
            'h-8 flex-row items-center gap-1.5 rounded-full border-hairline border-outline-variant bg-surface-raised elevation-2',
            rest ? 'w-8 justify-center' : `${lead} pr-2.5`,
          )}
          layerClassName="rounded-full"
        >
          <PillBody jump={jump} />
        </Interactive>
      </Rise>
    </Animated.View>
  );
}

export function FloatingDay({ label }: { readonly label: string }): ReactNode {
  const motion = useMotion();
  return (
    <Animated.View
      {...exiting(motion, PILL_OUT)}
      pointerEvents="none"
      className="absolute inset-x-0 top-2 items-center"
    >
      <Rise from={RISE_PX.pill} duration={150}>
        <View className="h-6 justify-center rounded-full border-hairline border-outline-variant bg-surface-raised/90 px-2.5">
          <Text variant="caption" tone="variant">
            {label}
          </Text>
        </View>
      </Rise>
    </Animated.View>
  );
}
