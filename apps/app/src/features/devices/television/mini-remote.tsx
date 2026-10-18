import type { ReactNode } from 'react';
import { View } from 'react-native';
import { DeviceScheduleChip } from '../../automations';
import { DeviceVisual } from '../../device-visuals';
import { CARD_APP_COUNT, type TvApp } from './apps';
import { ChipStrip } from './chip-strip';
import { Names } from './names';
import { PowerButton } from './power-button';
import { Quiet } from './quiet';
import { RemoteKey } from './remote-key';
import { compactPartsOf, type CompactParts, type LayoutFrame } from './remote-layout';
import { RingPad } from './ring-pad';
import { Rocker } from './rocker';
import type { TvSheets } from './sheet-state';
import type { Television } from './use-television';
import type { TelevisionActions } from './use-television-actions';

export interface MiniProps {
  readonly tv: Television;
  readonly actions: TelevisionActions;
  readonly sheets: TvSheets;
  readonly apps: readonly TvApp[];
  readonly frame: LayoutFrame;
}

const TALL_APPS = 6;

function resting(tv: Television): boolean {
  return tv.view.mode === 'standby' || tv.view.mode === 'turning_on';
}

function Head({ tv, compact }: { readonly tv: Television; readonly compact: boolean }): ReactNode {
  return (
    <View
      className={compact ? 'h-12 flex-row items-center gap-2' : 'h-14 flex-row items-center gap-3'}
      pointerEvents="box-none"
    >
      <View className={compact ? 'size-12' : 'size-14'} pointerEvents="none">
        <DeviceVisual device={tv.device} size="tile" />
      </View>
      <Names tv={tv} />
      {resting(tv) ? null : <PowerButton tv={tv} />}
    </View>
  );
}

function Controls({
  tv,
  sheets,
  parts,
}: Pick<MiniProps, 'tv' | 'sheets'> & { readonly parts: CompactParts }): ReactNode {
  const playable = tv.view.locks.play_pause === undefined;
  const muted = tv.view.volume.muted;
  return (
    <View className="flex-row items-center gap-1.5">
      <Rocker
        tv={tv}
        kind="volume"
        orientation="horizontal"
        onSeam={(): void => {
          sheets.open('volume');
        }}
      />
      {parts.mute ? (
        <RemoteKey
          tv={tv}
          name="mute"
          icon={muted ? 'muted' : 'volume'}
          look="round"
          label={muted ? 'Unmute' : 'Mute'}
          selected={muted}
        />
      ) : null}
      {playable && parts.play ? (
        <RemoteKey
          tv={tv}
          name="play_pause"
          icon={tv.view.playing ? 'pause' : 'play'}
          look="round"
          label={tv.view.playing ? 'Pause' : 'Play'}
        />
      ) : null}
    </View>
  );
}

function Bottom({
  remote,
  chips,
}: {
  readonly remote: MiniProps;
  readonly chips: boolean;
}): ReactNode {
  return chips ? (
    <ChipStrip {...remote} count={CARD_APP_COUNT} />
  ) : (
    <DeviceScheduleChip deviceId={remote.tv.device.id} compact />
  );
}

export function CompactRemote(props: MiniProps): ReactNode {
  const { tv, sheets, frame } = props;
  const parts = compactPartsOf(frame);
  const on = tv.view.mode === 'on';
  const ring = on && parts.ring && tv.view.locks.up === undefined;
  if (!on) {
    return (
      <View className="flex-1 gap-2" pointerEvents="box-none">
        <Head tv={tv} compact />
        <Quiet tv={tv} />
      </View>
    );
  }
  return (
    <View className="flex-1 flex-row items-center gap-2.5" pointerEvents="box-none">
      <View className="min-w-0 flex-1 gap-2" pointerEvents="box-none">
        <Head tv={tv} compact />
        <Controls tv={tv} sheets={sheets} parts={parts} />
        <Bottom remote={props} chips={parts.chips} />
      </View>
      {ring ? <RingPad tv={tv} size="card" /> : null}
    </View>
  );
}

export function CardRemote(props: MiniProps): ReactNode {
  const { tv, sheets, frame } = props;
  const parts = compactPartsOf(frame);
  const on = tv.view.mode === 'on';
  const ring = on && tv.view.locks.up === undefined;
  return (
    <View className="flex-1 gap-3" pointerEvents="box-none">
      <Head tv={tv} compact={false} />
      {on ? (
        <View className="flex-row items-center gap-2.5" pointerEvents="box-none">
          <View className="min-w-0 flex-1 gap-3" pointerEvents="box-none">
            <Controls tv={tv} sheets={sheets} parts={parts} />
            <ChipStrip {...props} count={CARD_APP_COUNT} />
          </View>
          {ring ? <RingPad tv={tv} size="card" /> : null}
        </View>
      ) : (
        <Quiet tv={tv} />
      )}
    </View>
  );
}

function TallTop({ tv }: { readonly tv: Television }): ReactNode {
  const ring = tv.view.locks.up === undefined;
  return (
    <View className="flex-row items-center gap-4" pointerEvents="box-none">
      {ring ? <RingPad tv={tv} size="quick" /> : null}
      <View className="min-w-0 flex-1 gap-2" pointerEvents="box-none">
        <View className="h-12 justify-center" pointerEvents="none">
          <Names tv={tv} />
        </View>
        <View className="flex-row gap-2">
          <RemoteKey tv={tv} name="back" icon="arrowLeft" look="round" label="Back" />
          <RemoteKey tv={tv} name="home" icon="home" look="round" label="Home" />
        </View>
      </View>
    </View>
  );
}

export function TallRemote(props: MiniProps): ReactNode {
  const { tv, sheets } = props;
  if (tv.view.mode !== 'on') {
    return (
      <View className="flex-1 gap-3" pointerEvents="box-none">
        <Head tv={tv} compact={false} />
        <Quiet tv={tv} />
      </View>
    );
  }
  return (
    <View className="flex-1 justify-center gap-3" pointerEvents="box-none">
      <TallTop tv={tv} />
      <View className="flex-row items-center justify-between gap-2" pointerEvents="box-none">
        <Controls
          tv={tv}
          sheets={sheets}
          parts={{ ring: true, mute: true, play: true, chips: true }}
        />
        <PowerButton tv={tv} />
      </View>
      <ChipStrip {...props} count={TALL_APPS} />
    </View>
  );
}

export function TileRemote({ tv }: MiniProps): ReactNode {
  return (
    <View className="flex-1 justify-center" pointerEvents="box-none">
      <Head tv={tv} compact />
    </View>
  );
}
