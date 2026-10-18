import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import type { Device } from '../../../store/state';
import { launchableApps, type TvApp } from './apps';
import { ChipStrip } from './chip-strip';
import { Quiet } from './quiet';
import { RemoteKey } from './remote-key';
import { RingPad } from './ring-pad';
import { Rocker } from './rocker';
import { useTvSheets, type TvSheets } from './sheet-state';
import { TelevisionSheets } from './sheets';
import { useTelevision, type Television } from './use-television';
import { useTelevisionActions, type TelevisionActions } from './use-television-actions';

const QUICK_APPS = 6;

interface QuickProps {
  readonly tv: Television;
  readonly actions: TelevisionActions;
  readonly sheets: TvSheets;
  readonly apps: readonly TvApp[];
}

function QuickKeys({ tv }: { readonly tv: Television }): ReactNode {
  const muted = tv.view.volume.muted;
  return (
    <View className="items-center gap-2.5">
      <RemoteKey tv={tv} name="back" icon="arrowLeft" look="pill" text="Back" />
      <RemoteKey tv={tv} name="home" icon="home" look="pill" text="Home" />
      <RemoteKey
        tv={tv}
        name="mute"
        icon={muted ? 'muted' : 'volume'}
        look="pill"
        text={muted ? 'Unmute' : 'Mute'}
        selected={muted}
      />
    </View>
  );
}

function QuickOn({ tv, actions, sheets, apps }: QuickProps): ReactNode {
  return (
    <>
      <View className="flex-row items-center justify-center gap-5">
        <RingPad tv={tv} size="quick" />
        <QuickKeys tv={tv} />
      </View>
      <View className="flex-row items-center justify-center gap-2">
        <Rocker
          tv={tv}
          kind="volume"
          orientation="horizontal"
          seamButton
          onSeam={(): void => {
            sheets.open('volume');
          }}
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
      </View>
      <ChipStrip tv={tv} actions={actions} sheets={sheets} apps={apps} count={QUICK_APPS} />
    </>
  );
}

export function TelevisionQuick({ device }: { readonly device: Device }): ReactNode {
  const tv = useTelevision(device);
  const actions = useTelevisionActions(tv);
  const sheets = useTvSheets();
  const apps = launchableApps(device);
  return (
    <View className="gap-4">
      {tv.view.mode === 'on' ? (
        <QuickOn tv={tv} actions={actions} sheets={sheets} apps={apps} />
      ) : (
        <Quiet tv={tv} />
      )}
      <Button
        label="Sleep timer"
        icon="timer"
        variant="tonal"
        onPress={(): void => {
          sheets.open('sleep');
        }}
      />
      <TelevisionSheets tv={tv} sheets={sheets} actions={actions} apps={apps} />
    </View>
  );
}
