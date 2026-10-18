import type { ReactNode } from 'react';
import { View } from 'react-native';
import { DeviceVisual } from '../../device-visuals';
import { CARD_APP_COUNT } from './apps';
import { ChipStrip } from './chip-strip';
import { Names } from './names';
import { PowerButton } from './power-button';
import { Quiet } from './quiet';
import { RemoteKey } from './remote-key';
import { RingPad } from './ring-pad';
import { Rocker } from './rocker';
import type { MiniProps } from './mini-remote';

function WideControls({ remote }: { readonly remote: MiniProps }): ReactNode {
  const { tv, sheets } = remote;
  const muted = tv.view.volume.muted;
  const ring = tv.view.locks.up === undefined;
  return (
    <View className="flex-row items-center gap-2" pointerEvents="box-none">
      <Rocker
        tv={tv}
        kind="volume"
        orientation="horizontal"
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
      {tv.view.locks.play_pause === undefined ? (
        <RemoteKey
          tv={tv}
          name="play_pause"
          icon={tv.view.playing ? 'pause' : 'play'}
          look="round"
          label={tv.view.playing ? 'Pause' : 'Play'}
        />
      ) : null}
      {ring ? (
        <>
          <RemoteKey tv={tv} name="back" icon="arrowLeft" look="round" label="Back" />
          <RemoteKey tv={tv} name="home" icon="home" look="round" label="Home" />
          <RingPad tv={tv} size="card" />
        </>
      ) : null}
    </View>
  );
}

export function WideRemote(props: MiniProps): ReactNode {
  const { tv } = props;
  const on = tv.view.mode === 'on';
  const resting = tv.view.mode === 'standby' || tv.view.mode === 'turning_on';
  return (
    <View className="flex-1 flex-row items-center gap-4" pointerEvents="box-none">
      <View className="min-w-0 flex-1 justify-center gap-2" pointerEvents="box-none">
        <View className="h-14 flex-row items-center gap-3" pointerEvents="box-none">
          <View className="size-14 items-center justify-center" pointerEvents="none">
            <DeviceVisual device={tv.device} size="tile" />
          </View>
          <Names tv={tv} />
        </View>
        {on ? <ChipStrip {...props} count={CARD_APP_COUNT} /> : null}
      </View>
      {on ? (
        <WideControls remote={props} />
      ) : (
        <View className="min-w-0 flex-1" pointerEvents="box-none">
          <Quiet tv={tv} />
        </View>
      )}
      {resting ? null : <PowerButton tv={tv} />}
    </View>
  );
}
