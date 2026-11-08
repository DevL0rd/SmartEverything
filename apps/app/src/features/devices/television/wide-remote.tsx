import type { ReactNode } from 'react';
import { View } from 'react-native';
import { CARD_APP_COUNT } from './apps';
import { ChipStrip } from './chip-strip';
import { Head, type MiniProps } from './mini-remote';
import { PlayPauseKeys, playPauseReachable } from './play-pause';
import { PowerButton } from './power-button';
import { stackWideControls } from './remote-layout';
import { RemoteKey } from './remote-key';
import { RingPad } from './ring-pad';
import { Rocker } from './rocker';

function AudioKeys({ remote }: { readonly remote: MiniProps }): ReactNode {
  const { tv, sheets } = remote;
  const muted = tv.view.volume.muted;
  return (
    <>
      <Rocker
        tv={tv}
        kind="volume"
        orientation="horizontal"
        opener={sheets.openers.volume}
        onSeam={(): void => {
          sheets.open('volume');
        }}
      />
      <RemoteKey
        tv={tv}
        name="mute"
        icon={muted ? 'muted' : 'volume'}
        look="round"
        label={muted ? 'Unmute' : 'Mute'}
        selected={muted}
      />
      {playPauseReachable(tv) ? <PlayPauseKeys tv={tv} look="round" /> : null}
    </>
  );
}

function NavigationKeys({ tv }: Pick<MiniProps, 'tv'>): ReactNode {
  return (
    <>
      <RemoteKey tv={tv} name="back" icon="arrowLeft" look="round" label="Back" />
      <RemoteKey tv={tv} name="home" icon="home" look="round" label="Home" />
    </>
  );
}

function StackedControls({ remote }: { readonly remote: MiniProps }): ReactNode {
  const { tv } = remote;
  const ring = tv.view.locks.up === undefined;
  return (
    <View className="flex-row items-center gap-2" pointerEvents="box-none">
      <View className="items-start gap-2" pointerEvents="box-none">
        <View className="flex-row items-center gap-2" pointerEvents="box-none">
          <AudioKeys remote={remote} />
        </View>
        <View className="flex-row items-center gap-2" pointerEvents="box-none">
          {ring ? <NavigationKeys tv={tv} /> : null}
          <PowerButton tv={tv} size="control" />
        </View>
      </View>
      {ring ? <RingPad tv={tv} size="card" /> : null}
    </View>
  );
}

function WideControls({ remote }: { readonly remote: MiniProps }): ReactNode {
  const { tv, width } = remote;
  if (stackWideControls(width)) return <StackedControls remote={remote} />;
  const ring = tv.view.locks.up === undefined;
  return (
    <>
      <View className="flex-row items-center gap-2" pointerEvents="box-none">
        <AudioKeys remote={remote} />
        {ring ? (
          <>
            <NavigationKeys tv={tv} />
            <RingPad tv={tv} size="card" />
          </>
        ) : null}
      </View>
      <PowerButton tv={tv} size="control" />
    </>
  );
}

export function WideRemote(props: MiniProps): ReactNode {
  return (
    <View className="flex-1 flex-row items-center gap-4" pointerEvents="box-none">
      <View className="min-w-0 flex-1 justify-center gap-2" pointerEvents="box-none">
        <Head tv={props.tv} power={false} />
        <ChipStrip {...props} count={CARD_APP_COUNT} />
      </View>
      <WideControls remote={props} />
    </View>
  );
}
