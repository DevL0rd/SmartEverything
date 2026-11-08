import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ActionBand } from '../../../components/widget-board/action-band';
import { DeviceVisual } from '../../device-visuals';
import { cn } from '../../../design/cn';
import type { TvApp } from './apps';
import { ChipStrip } from './chip-strip';
import { Names } from './names';
import { PlayPauseKeys, playPauseReachable } from './play-pause';
import { PowerButton } from './power-button';
import { RemoteKey } from './remote-key';
import { compactPartsOf, tallRingSize, type CompactParts } from './remote-layout';
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
  readonly width: number;
}

const TALL_APPS = 6;
const FULL_AUDIO: CompactParts = {
  ring: true,
  mute: true,
  play: true,
  playPair: true,
};

export function Head({
  tv,
  power,
}: {
  readonly tv: Television;
  readonly power: boolean;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-3" pointerEvents="box-none">
      <View className="size-12" pointerEvents="none">
        <DeviceVisual device={tv.device} size="tile" />
      </View>
      <Names tv={tv} />
      {power ? <PowerButton tv={tv} size="control" /> : null}
    </View>
  );
}

function Controls({
  tv,
  sheets,
  parts,
  power = false,
}: Pick<MiniProps, 'tv' | 'sheets'> & {
  readonly parts: CompactParts;
  readonly power?: boolean;
}): ReactNode {
  const fits = tv.view.playback === null ? parts.playPair : parts.play;
  const playable = fits && playPauseReachable(tv);
  const muted = tv.view.volume.muted;
  return (
    <View className={cn('flex-row items-center gap-1.5', power && 'flex-wrap')}>
      <Rocker
        tv={tv}
        kind="volume"
        orientation="horizontal"
        opener={sheets.openers.volume}
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
      {playable ? <PlayPauseKeys tv={tv} look="round" /> : null}
      {power ? (
        <View className="ml-auto">
          <PowerButton tv={tv} size="control" />
        </View>
      ) : null}
    </View>
  );
}

export function CompactRemote({ tv, sheets, width }: MiniProps): ReactNode {
  const parts = compactPartsOf(width, tv.view.locks.up === undefined);
  return (
    <View className="flex-1 flex-row items-center gap-2.5" pointerEvents="box-none">
      <View className="min-w-0 flex-1 gap-1.5 self-stretch" pointerEvents="box-none">
        <Head tv={tv} power />
        <Controls tv={tv} sheets={sheets} parts={parts} />
        <ActionBand />
      </View>
      {parts.ring ? <RingPad tv={tv} size="card" /> : null}
    </View>
  );
}

function TallTop({ tv, width }: Pick<MiniProps, 'tv' | 'width'>): ReactNode {
  const ring = tv.view.locks.up === undefined;
  return (
    <View className="flex-row items-center gap-4" pointerEvents="box-none">
      {ring ? <RingPad tv={tv} size={tallRingSize(width)} /> : null}
      <View className="min-w-0 flex-1 gap-2" pointerEvents="box-none">
        <View className="flex-row" pointerEvents="none">
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
  const { tv, sheets, width } = props;
  return (
    <View className="flex-1 gap-3" pointerEvents="box-none">
      <TallTop tv={tv} width={width} />
      <Controls tv={tv} sheets={sheets} parts={FULL_AUDIO} power />
      <View className="mt-auto" pointerEvents="box-none">
        <ChipStrip {...props} count={TALL_APPS} />
      </View>
    </View>
  );
}

export function TileRemote({ tv }: { readonly tv: Television }): ReactNode {
  return (
    <View className="flex-1 justify-center" pointerEvents="box-none">
      <Head tv={tv} power={tv.view.mode !== 'standby' && tv.view.mode !== 'turning_on'} />
    </View>
  );
}
