import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { playTime } from '../../../format/time';
import { useSecondOf } from '../../../store/clock';
import { useTalkShortcutLabel } from '../desktop/use-talk-shortcuts';
import { usePushToTalk, type PushState, type PushToTalk } from './use-push-to-talk';
import { VoiceRing, type RingMotion } from './voice-ring';

export type TalkButtonSize = 'hero' | 'compact' | 'row';

const SECOND = 1000;

const FACE: Readonly<Record<PushState, string>> = {
  off: 'bg-surface-3',
  unavailable: 'bg-surface-3',
  not_member: 'bg-surface-3',
  ready: 'bg-primary',
  requesting: 'bg-primary',
  talking: 'bg-critical',
  busy: 'bg-surface-3',
  receiving: 'bg-primary-container',
  live: 'bg-primary-container',
};

const GLYPH: Readonly<Record<PushState, IconName>> = {
  off: 'micOff',
  unavailable: 'micOff',
  not_member: 'mic',
  ready: 'mic',
  requesting: 'mic',
  talking: 'mic',
  busy: 'audioLines',
  receiving: 'audioLines',
  live: 'audioLines',
};

const SIZE: Readonly<Record<TalkButtonSize, { face: string; ring: string; icon: 24 | 40 }>> = {
  hero: { face: 'size-44', ring: 'size-44', icon: 40 },
  compact: { face: 'size-16', ring: 'size-16', icon: 24 },
  row: { face: 'size-12', ring: 'size-12', icon: 24 },
};

function useElapsed(startedAt: number | null): number {
  return useSecondOf(
    (now) => (startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / SECOND))),
    startedAt !== null,
  );
}

const LABELS: Readonly<Record<PushState, (push: PushToTalk, elapsed: number) => string>> = {
  off: () => 'Walkie-talkie is off',
  unavailable: (push) => push.problem ?? 'Connecting…',
  not_member: () => 'Join to talk',
  requesting: () => 'Connecting…',
  talking: (_push, elapsed) => `Talking · ${playTime(elapsed)}`,
  busy: (push) => `${push.speaker?.label ?? 'Someone'} is talking`,
  receiving: (push) => push.speaker?.label ?? 'Someone',
  live: (push) => `${push.liveLabel ?? 'Someone'} is talking · mic on`,
  ready: (push) => (push.mode === 'hold' ? 'Hold to talk' : 'Tap to talk'),
};

function talkLabel(push: PushToTalk, elapsed: number): string {
  return LABELS[push.state](push, elapsed);
}

function hintOf(push: PushToTalk, shortcut: string | null): string | null {
  if (push.state === 'talking') {
    return push.mode === 'hold' ? 'Release to send' : 'Tap to stop';
  }
  if (push.state === 'ready' && shortcut !== null) {
    return push.mode === 'hold' ? `or hold ${shortcut}` : `or press ${shortcut}`;
  }
  return null;
}

const PULSING: ReadonlySet<PushState> = new Set(['receiving', 'requesting', 'live']);

function ringOf(state: PushState): RingMotion {
  if (state === 'talking') {
    return 'level';
  }
  return PULSING.has(state) ? 'pulse' : 'still';
}

function usable(state: PushState): boolean {
  return state === 'ready' || state === 'requesting' || state === 'talking';
}

function Caption({
  label,
  hint,
}: {
  readonly label: string;
  readonly hint: string | null;
}): ReactNode {
  return (
    <View className="items-center gap-1">
      <Text variant="title-3" align="center" numberOfLines={1}>
        {label}
      </Text>
      {hint === null ? null : (
        <Text variant="footnote" tone="variant" align="center">
          {hint}
        </Text>
      )}
    </View>
  );
}

function onFaceOf(state: PushState): boolean {
  return state === 'ready' || state === 'talking' || state === 'requesting';
}

export function TalkButton({
  channelId,
  size,
  editing = false,
}: {
  readonly channelId: string;
  readonly size: TalkButtonSize;
  readonly editing?: boolean;
}): ReactNode {
  const push = usePushToTalk(channelId);
  const label = talkLabel(push, useElapsed(push.startedAt));
  const shortcut = useTalkShortcutLabel();
  const dims = SIZE[size];
  const onFace = onFaceOf(push.state);
  return (
    <View className="items-center gap-3">
      <View className={cn('items-center justify-center', dims.ring)}>
        <VoiceRing
          motion={ringOf(push.state)}
          level={push.level}
          tone={push.state === 'talking' ? 'talk' : 'hear'}
          className={dims.ring}
        />
        <Interactive
          role="button"
          label={label}
          hint={push.mode === 'hold' ? 'Hold to talk, release to send' : 'Tap to start and stop'}
          disabled={editing || !usable(push.state)}
          selected={push.state === 'talking'}
          onTone={onFace ? 'primary' : 'surface'}
          onPressIn={push.onPressIn}
          onPressOut={push.onPressOut}
          onPress={push.onPress}
          className={cn(
            'items-center justify-center rounded-full elevation-2',
            dims.face,
            FACE[push.state],
          )}
          layerClassName="rounded-full"
        >
          <Icon name={GLYPH[push.state]} size={dims.icon} tone={onFace ? 'onPrimary' : 'variant'} />
        </Interactive>
      </View>
      {size === 'hero' ? <Caption label={label} hint={hintOf(push, shortcut)} /> : null}
    </View>
  );
}
