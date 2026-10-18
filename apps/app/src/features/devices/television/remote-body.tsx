import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { TV_KEY_REASON_TEXT, type TvKey } from '@smarteverything/domain';
import { cn } from '../../../design/cn';
import { BODY_FILL } from './key-style';
import { routeKeyboard, type KeyboardAction } from './keyboard';
import { canUseNumberPad } from './numpad';
import { ReasonSlot } from './reason-slot';
import { RemoteKey } from './remote-key';
import { RingPad } from './ring-pad';
import { Rocker } from './rocker';
import type { TvSheets } from './sheet-state';
import type { Television } from './use-television';
import { useRemoteKeyboard } from './use-remote-keyboard';

const PLAYBACK_KEYS: readonly TvKey[] = ['prev_track', 'rewind', 'play_pause', 'ff', 'next_track'];

const COLOURS: readonly {
  readonly name: TvKey;
  readonly label: string;
  readonly tint: string;
}[] = [
  { name: 'red', label: 'Red', tint: 'border-viz-4 from-viz-4/25 to-viz-4/25' },
  { name: 'green', label: 'Green', tint: 'border-viz-5 from-viz-5/25 to-viz-5/25' },
  { name: 'yellow', label: 'Yellow', tint: 'border-viz-2 from-viz-2/25 to-viz-2/25' },
  { name: 'blue', label: 'Blue', tint: 'border-viz-6 from-viz-6/25 to-viz-6/25' },
];

function TopRow({ tv }: { readonly tv: Television }): ReactNode {
  return (
    <View className="w-full flex-row justify-between">
      <RemoteKey tv={tv} name="back" icon="arrowLeft" look="pill" text="Back" />
      <RemoteKey tv={tv} name="home" icon="home" look="pill" text="Home" />
      <RemoteKey tv={tv} name="menu" icon="more" look="pill" text="Menu" />
    </View>
  );
}

function NumberKey({
  tv,
  sheets,
}: {
  readonly tv: Television;
  readonly sheets: TvSheets;
}): ReactNode {
  return (
    <RemoteKey
      tv={tv}
      name="n0"
      icon="hash"
      text="123"
      label="Number pad"
      lockText={canUseNumberPad(tv.view) ? null : TV_KEY_REASON_TEXT.needs_direct}
      run={(): void => {
        sheets.open('numpad');
      }}
    />
  );
}

function KeyGrid({
  tv,
  sheets,
}: {
  readonly tv: Television;
  readonly sheets: TvSheets;
}): ReactNode {
  const { view } = tv;
  const monitor = view.category === 'monitor';
  const muted = view.volume.muted;
  return (
    <View
      className={cn(
        'flex-row flex-wrap content-center justify-center gap-x-2 gap-y-6',
        monitor ? 'w-28' : 'w-43',
      )}
    >
      <RemoteKey
        tv={tv}
        name="mute"
        icon={muted ? 'muted' : 'volume'}
        text={muted ? 'Unmute' : 'Mute'}
        selected={muted}
      />
      {monitor ? null : <NumberKey tv={tv} sheets={sheets} />}
      <RemoteKey
        tv={tv}
        name="source"
        icon="cable"
        text="Source"
        lockText={view.mode === 'on' ? null : TV_KEY_REASON_TEXT.tv_off}
        run={(): void => {
          sheets.open('inputs');
        }}
      />
      {monitor ? null : <RemoteKey tv={tv} name="guide" icon="bookOpen" text="Guide" />}
      <RemoteKey tv={tv} name="info" icon="info" text="Info" />
      <RemoteKey tv={tv} name="settings" icon="settings" text="Settings" />
    </View>
  );
}

function SideRocker({
  tv,
  onHeld,
}: {
  readonly tv: Television;
  readonly onHeld: () => void;
}): ReactNode {
  if (tv.view.category === 'monitor') {
    return <View className="w-14" />;
  }
  return <Rocker tv={tv} kind="channel" orientation="vertical" onSeam={null} onHeld={onHeld} />;
}

function PlaybackRow({ tv }: { readonly tv: Television }): ReactNode {
  const { view } = tv;
  const reachable = PLAYBACK_KEYS.some((name) => view.locks[name] === undefined);
  if (view.mode === 'on' && !reachable) {
    return null;
  }
  return (
    <View className="w-full flex-row items-center justify-between">
      <RemoteKey tv={tv} name="prev_track" icon="skipBack" look="play" label="Previous" />
      <RemoteKey tv={tv} name="rewind" icon="rewind" look="play" label="Rewind" />
      <RemoteKey
        tv={tv}
        name="play_pause"
        icon={view.playing ? 'pause' : 'play'}
        look="play"
        label={view.playing ? 'Pause' : 'Play'}
        emphasis
      />
      <RemoteKey tv={tv} name="ff" icon="fastForward" look="play" label="Fast-forward" />
      <RemoteKey tv={tv} name="next_track" icon="skipForward" look="play" label="Next" />
    </View>
  );
}

function ColourRow({ tv }: { readonly tv: Television }): ReactNode {
  if (tv.view.locks.red !== undefined) {
    return null;
  }
  return (
    <View className="w-full flex-row justify-between">
      {COLOURS.map((colour) => (
        <RemoteKey
          key={colour.name}
          tv={tv}
          name={colour.name}
          look="pill"
          text={colour.label}
          className={cn('h-11 w-18', colour.tint)}
        />
      ))}
    </View>
  );
}

function MidRow({
  tv,
  sheets,
  onHeld,
}: {
  readonly tv: Television;
  readonly sheets: TvSheets;
  readonly onHeld: () => void;
}): ReactNode {
  return (
    <View className="h-42 w-full flex-row items-center justify-between">
      <Rocker
        tv={tv}
        kind="volume"
        orientation="vertical"
        seamButton
        onSeam={() => {
          sheets.open('volume');
        }}
        onHeld={onHeld}
      />
      <KeyGrid tv={tv} sheets={sheets} />
      <SideRocker tv={tv} onHeld={onHeld} />
    </View>
  );
}

function useBodyKeyboard(tv: Television, sheets: TvSheets): boolean {
  const sheet = sheets.sheet?.kind ?? null;
  const active = tv.view.mode === 'on' && (sheet === null || sheet === 'numpad');
  return useRemoteKeyboard(active, (action: KeyboardAction) => {
    const route = routeKeyboard(action, canUseNumberPad(tv.view), sheet);
    if (route === null) {
      return false;
    }
    if (route.kind === 'press') {
      tv.press(route.key);
    } else if (route.kind === 'open_numpad') {
      sheets.open('numpad', route.digit);
    } else if (route.kind === 'digit') {
      sheets.digit(route.digit);
    } else {
      sheets.erase();
    }
    return true;
  });
}

export function RemoteBody({
  tv,
  sheets,
}: {
  readonly tv: Television;
  readonly sheets: TvSheets;
}): ReactNode {
  const [held, setHeld] = useState(false);
  const dim = tv.view.mode !== 'on';
  const keyboard = useBodyKeyboard(tv, sheets);
  const markHeld = (): void => {
    setHeld(true);
  };
  return (
    <View
      className={cn(
        'w-full max-w-100 items-center self-center rounded-xxl border-hairline border-outline-variant px-4 pb-5 pt-11 elevation-2',
        BODY_FILL,
      )}
    >
      <View
        pointerEvents="none"
        className="absolute inset-x-0 top-0 h-28 rounded-t-xxl bg-linear-to-b from-primary/10 to-transparent"
      />
      <ReasonSlot tv={tv} keyboard={keyboard} held={held} />
      <View className={cn('w-full items-center gap-4', dim && 'opacity-55')}>
        <TopRow tv={tv} />
        <RingPad tv={tv} size="page" onHeld={markHeld} />
        <MidRow tv={tv} sheets={sheets} onHeld={markHeld} />
        <PlaybackRow tv={tv} />
        <ColourRow tv={tv} />
      </View>
    </View>
  );
}
