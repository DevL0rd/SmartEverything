import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AudioApp, AudioDevice } from '@smarteverything/domain';
import { IconWell } from '../../../components/icon-well';
import { ChoiceChip } from '../../../components/choice-chip';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { appOutputId, deviceIcon, masterOf, outputOptions, sliderMax } from '../model/audio-model';
import { LevelSlider, MuteToggle } from './level-slider';

export interface AppRowProps {
  readonly app: AudioApp;
  readonly outputs: readonly AudioDevice[];
  readonly over: boolean;
  readonly offline: boolean;
  readonly wide: boolean;
  readonly onVolume: (app: AudioApp, level: number, failed: () => void) => void;
  readonly onMute: (app: AudioApp, muted: boolean) => void;
  readonly onOutput: (app: AudioApp, output: string) => void;
}

const APP_MAX = { maxVolume: 150 } as const;

function AppSlider({
  app,
  over,
  offline,
  wide,
  onVolume,
  onMute,
}: Pick<AppRowProps, 'app' | 'over' | 'offline' | 'wide' | 'onVolume' | 'onMute'>): ReactNode {
  return (
    <View className={cn('min-w-0 flex-row items-center gap-2', wide ? 'flex-1' : '')}>
      <LevelSlider
        label={`${app.app} volume`}
        value={app.volume}
        max={sliderMax(APP_MAX, over)}
        disabled={offline}
        muted={app.muted}
        onCommit={(level, failed) => {
          onVolume(app, level, failed);
        }}
        onUnmute={() => {
          onMute(app, false);
        }}
      />
      <MuteToggle
        label={app.app}
        muted={app.muted}
        disabled={offline}
        onChange={(muted) => {
          onMute(app, muted);
        }}
      />
    </View>
  );
}

function AppOutput({
  app,
  outputs,
  offline,
  onOutput,
}: Pick<AppRowProps, 'app' | 'outputs' | 'offline' | 'onOutput'>): ReactNode {
  const current = appOutputId(app, outputs);
  const chosen = outputs.find((device) => device.id === current);
  return (
    <View
      className={cn('max-w-56 shrink', offline ? 'opacity-50' : '')}
      pointerEvents={offline ? 'none' : 'auto'}
    >
      <ChoiceChip
        label={`Output for ${app.app}`}
        icon={chosen === undefined ? 'speaker' : deviceIcon(chosen)}
        options={outputOptions(outputs)}
        value={current ?? ''}
        all={masterOf(outputs)?.id ?? ''}
        onChange={(id) => {
          onOutput(app, id);
        }}
      />
    </View>
  );
}

function AppName({ app, wide }: { readonly app: AudioApp; readonly wide: boolean }): ReactNode {
  return (
    <View className={cn('min-w-0 flex-row items-center gap-3', wide ? 'w-80 shrink-0' : 'flex-1')}>
      <IconWell icon="speaker" colour="viz-1" size="s" />
      <Text variant="body" numberOfLines={2} className="min-w-0 flex-1">
        {app.app}
      </Text>
    </View>
  );
}

export function AppRow(props: AppRowProps): ReactNode {
  const { app, wide } = props;
  if (wide) {
    return (
      <View className="min-h-14 flex-row items-center gap-3 px-3 py-1">
        <AppName app={app} wide={wide} />
        <AppSlider {...props} />
        <AppOutput {...props} />
      </View>
    );
  }
  return (
    <View className="gap-1 px-3 py-2">
      <View className="flex-row items-center gap-3">
        <AppName app={app} wide={wide} />
        <AppOutput {...props} />
      </View>
      <AppSlider {...props} />
    </View>
  );
}
