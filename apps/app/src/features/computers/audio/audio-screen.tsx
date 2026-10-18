import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { AudioApp, AudioDevice, AudioState, ComputerFeature } from '@smarteverything/domain';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { ReasonLine } from '../../../components/reason-line';
import { SwitchRow } from '../../../components/rows';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { List } from '../../../components/section';
import { useAreaWidth } from '../../../design/size-class';
import { useDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { ComputerFrame } from '../components/computer-frame';
import { DemandRegion } from '../../../store/demand-region';
import { StateMissing } from '../components/state-missing';
import { NowPlayingRow, useMedia } from '../components/now-playing';
import { useAudioChange, useComputerAudio, type AudioView } from '../data/computer-audio';
import { masterOf } from '../model/audio-model';
import { bodyWidthOf } from '../model/sections';
import { AppRow } from './app-row';
import { DeviceRow } from './device-row';
import { LevelSlider, MuteToggle } from './level-slider';

const TOPICS = ['audio'] as const;

const WIDE_BODY = 560;

type Change = ReturnType<typeof useAudioChange>;

interface SectionProps {
  readonly state: AudioState;
  readonly over: boolean;
  readonly offline: boolean;
  readonly wide: boolean;
  readonly change: Change;
}

function MasterRow({ state, over, offline, wide, change }: SectionProps): ReactNode {
  const master = masterOf(state.outputs);
  if (master === null) return null;
  return (
    <View className="flex-row items-center gap-3 px-3 py-2">
      <Text variant="body-strong" className={wide ? 'w-80 shrink-0' : 'w-24 shrink-0'}>
        All sound
      </Text>
      <LevelSlider
        label="All sound volume"
        value={master.volume}
        max={over ? master.maxVolume : 100}
        disabled={offline}
        muted={master.muted}
        onCommit={(level, failed) => {
          change({ action: 'volume', level, kind: 'output' }, failed);
        }}
        onUnmute={() => {
          change({ action: 'mute', muted: false, kind: 'output' });
        }}
      />
      <MuteToggle
        label="all sound"
        muted={master.muted}
        disabled={offline}
        onChange={(muted) => {
          change({ action: 'mute', muted, kind: 'output' });
        }}
      />
    </View>
  );
}

function DeviceList({
  title,
  kind,
  devices,
  ...rest
}: SectionProps & {
  readonly title: string;
  readonly kind: 'output' | 'input';
  readonly devices: readonly AudioDevice[];
}): ReactNode {
  const { over, offline, wide, change } = rest;
  return (
    <List title={title}>
      {kind === 'output' ? <MasterRow {...rest} /> : null}
      {devices.map((device) => (
        <DeviceRow
          key={device.id}
          device={device}
          over={over}
          offline={offline}
          wide={wide}
          onDefault={(picked) => {
            change({ action: 'default', kind, device: picked.id });
          }}
          onVolume={(picked, level, failed) => {
            change({ action: 'volume', level, kind, device: picked.id }, failed);
          }}
          onMute={(picked, muted) => {
            change({ action: 'mute', muted, kind, device: picked.id });
          }}
        />
      ))}
    </List>
  );
}

function AppList({ state, over, offline, wide, change }: SectionProps): ReactNode {
  return (
    <List title="Apps" caption={String(state.apps.length)}>
      {state.apps.map((app) => (
        <AppRow
          key={app.streamId}
          app={app}
          outputs={state.outputs}
          over={over}
          offline={offline}
          wide={wide}
          onVolume={(picked: AudioApp, level, failed) => {
            change({ action: 'app_volume', app: picked.streamId, level }, failed);
          }}
          onMute={(picked, muted) => {
            change({ action: 'app_mute', app: picked.streamId, muted });
          }}
          onOutput={(picked, output) => {
            change({ action: 'app_output', app: picked.streamId, output });
          }}
        />
      ))}
    </List>
  );
}

function NowPlaying({
  deviceId,
  offline,
}: {
  readonly deviceId: string;
  readonly offline: boolean;
}): ReactNode {
  const media = useMedia(deviceId);
  if (media === null) return null;
  return (
    <Card title="Now playing">
      <NowPlayingRow deviceId={deviceId} disabled={offline} compact={false} />
    </Card>
  );
}

function offers(
  features: readonly ComputerFeature[] | undefined,
  feature: ComputerFeature,
): boolean {
  return features === undefined || features.includes(feature);
}

function Loading(): ReactNode {
  return (
    <View className="gap-4">
      <Skeleton shape="block" />
      <Skeleton shape="block" />
      <Skeleton shape="block" />
    </View>
  );
}

function unavailable(view: AudioView, device: Device): ReactNode {
  const { state, features } = view;
  if (features !== undefined && !features.includes('audio')) {
    return (
      <EmptyState
        icon="speaker"
        title="Sound control isn’t available on this computer yet"
        body="It needs PipeWire or PulseAudio to be running."
      />
    );
  }
  if (state === undefined) {
    return <StateMissing load={view.load} offline={!device.online} loading={<Loading />} />;
  }
  if (state.outputs.length > 0 || state.inputs.length > 0) return null;
  return (
    <EmptyState
      icon="speaker"
      title="No sound devices found"
      body="Plug in speakers or headphones and they show up here."
    />
  );
}

function AudioSections({
  state,
  features,
  device,
}: {
  readonly state: AudioState;
  readonly features: AudioView['features'];
  readonly device: Device;
}): ReactNode {
  const change = useAudioChange(device.id);
  const [over, setOver] = useState(false);
  const wide = bodyWidthOf(useAreaWidth()) >= WIDE_BODY;
  const offline = !device.online;
  const shared = { state, over, offline, wide, change };
  return (
    <View className="gap-section-gap">
      {offline ? (
        <ReasonLine
          icon="wifiOff"
          tone="warning"
          text={`${device.label} is offline. Sound controls come back when it is.`}
        />
      ) : null}
      <DeviceList {...shared} title="Output" kind="output" devices={state.outputs} />
      {state.inputs.length > 0 && offers(features, 'microphone') ? (
        <DeviceList {...shared} title="Input" kind="input" devices={state.inputs} />
      ) : null}
      {state.apps.length > 0 && offers(features, 'audio_apps') ? <AppList {...shared} /> : null}
      <NowPlaying deviceId={device.id} offline={offline} />
      <List title="Settings">
        <SwitchRow
          title="Allow over 100 %"
          subtitle="Lets a volume go up to 150 % when the sound device supports it"
          value={over}
          onChange={setOver}
        />
      </List>
    </View>
  );
}

export function AudioBody({ device }: { readonly device: Device }): ReactNode {
  const view = useComputerAudio(device.id, device.online);
  const message = unavailable(view, device);
  if (message !== null || view.state === undefined) return message;
  return <AudioSections state={view.state} features={view.features} device={device} />;
}

export function ComputerAudioScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const device = useDevice(deviceId);
  return (
    <ComputerFrame deviceId={deviceId} title="Audio" width="detail">
      {device?.kind === 'computer' ? (
        <DemandRegion deviceId={deviceId} topics={TOPICS}>
          <AudioBody device={device} />
        </DemandRegion>
      ) : null}
    </ComputerFrame>
  );
}
