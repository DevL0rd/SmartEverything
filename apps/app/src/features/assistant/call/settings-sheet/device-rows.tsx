import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../../components/icon';
import { SelectRow, ValueRow } from '../../../../components/rows';
import type { SelectOption } from '../../../../components/select-picker';
import { Slider } from '../../../../components/slider';
import { Text } from '../../../../components/text';
import { appPlatform } from '../../../../design/platform';
import { useCallAudioDevices, type AudioDevice } from '../audio-devices';
import { useCallAudio } from './call-audio-pref';

const AUTO = 'auto';

function optionsOf(
  devices: readonly AudioDevice[],
  leading: readonly SelectOption<string>[],
): readonly SelectOption<string>[] {
  return [
    ...leading,
    ...devices.map((device) => ({
      value: device.id,
      label: device.connected ? device.label : `${device.label} (not connected)`,
    })),
  ];
}

function missingNote(
  chosen: string,
  devices: readonly AudioDevice[],
  fallback: string,
  named: readonly string[],
): string | null {
  if (named.includes(chosen)) {
    return null;
  }
  const found = devices.find((device) => device.id === chosen);
  if (found?.connected === true) {
    return null;
  }
  return `${found?.label ?? 'The chosen device'} (not connected) · using ${fallback}`;
}

function withSelected(
  options: readonly SelectOption<string>[],
  chosen: string,
): readonly SelectOption<string>[] {
  return options.some((option) => option.value === chosen)
    ? options
    : [...options, { value: chosen, label: 'Not connected' }];
}

export function MicrophoneRow(): ReactNode {
  const { pref, change } = useCallAudio();
  const { inputs } = useCallAudioDevices();
  const options = withSelected(
    optionsOf(inputs, [{ value: AUTO, label: 'Automatic' }]),
    pref.input,
  );
  const note = missingNote(pref.input, inputs, 'the system choice', [AUTO]);
  return (
    <SelectRow
      title="Microphone"
      {...(note === null ? {} : { subtitle: note })}
      wrapSubtitle
      options={options}
      value={pref.input}
      onChange={(value) => {
        const label = options.find((option) => option.value === value)?.label ?? value;
        change({ input: value }, `Microphone · ${label}`);
      }}
    />
  );
}

const SPEAKER_LEADING: readonly SelectOption<string>[] = [
  { value: 'speaker', label: 'Speaker' },
  { value: AUTO, label: 'Automatic' },
];

export function SpeakerRow(): ReactNode {
  const { pref, change } = useCallAudio();
  const { outputs, outputChoosable } = useCallAudioDevices();
  if (outputChoosable !== null) {
    return (
      <ValueRow title="Speaker" value="System speaker" subtitle={outputChoosable} wrapSubtitle />
    );
  }
  const leading =
    appPlatform() === 'android'
      ? [...SPEAKER_LEADING, { value: 'earpiece', label: 'Phone earpiece' }]
      : SPEAKER_LEADING;
  const options = withSelected(optionsOf(outputs, leading), pref.output);
  const note = missingNote(pref.output, outputs, 'the speaker', [AUTO, 'speaker', 'earpiece']);
  return (
    <SelectRow
      title="Speaker"
      {...(note === null ? {} : { subtitle: note })}
      wrapSubtitle
      options={options}
      value={pref.output}
      onChange={(value) => {
        const label = options.find((option) => option.value === value)?.label ?? value;
        change({ output: value }, `Speaker · ${label}`);
      }}
    />
  );
}

const PERCENT = 100;

export function VolumeRow(): ReactNode {
  const { pref, change } = useCallAudio();
  const [dragged, setDragged] = useState<number | null>(null);
  const shown = dragged ?? Math.round(pref.volume * PERCENT);
  return (
    <View className="gap-1 px-4 py-3">
      <View className="flex-row items-center justify-between">
        <Text variant="body">Assistant volume</Text>
        <Text variant="label" tone="primary">{`${String(shown)}%`}</Text>
      </View>
      <View className="flex-row items-center gap-1">
        <Icon name="muted" size={20} tone="variant" />
        <View className="min-w-0 flex-1">
          <Slider
            label="Assistant volume"
            value={shown}
            min={0}
            max={PERCENT}
            step={1}
            formatValue={(value) => `${String(Math.round(value))} percent`}
            onChange={setDragged}
            onCommit={(value) => {
              setDragged(null);
              change(
                { volume: value / PERCENT },
                `Assistant volume · ${String(Math.round(value))}%`,
              );
            }}
          />
        </View>
        <Icon name="volume" size={20} tone="variant" />
      </View>
    </View>
  );
}
