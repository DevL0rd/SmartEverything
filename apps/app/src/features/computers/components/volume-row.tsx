import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { IconButton } from '../../../components/icon-button';
import { Slider } from '../../../components/slider';
import { Text } from '../../../components/text';
import { decimal } from '../../../format/number';
import { useControl } from '../../../store/control';
import type { Device } from '../../../store/state';
import { useComputerCommand } from '../data/computer-device';
import { useComputerSelect } from '../data/computer-metrics';

const SLIDER_MAX = 100;

function percentText(level: number): string {
  return `${decimal(Math.round(level))} %`;
}

interface RowProps {
  readonly device: Device;
  readonly label: string;
  readonly disabled: boolean;
  readonly muted: boolean;
}

function VolumeSlider({ device, label, disabled, muted }: RowProps): ReactNode {
  const volume = useControl(device.id, 'volume');
  const reported = useComputerSelect(device.id, (parts) => parts.session?.volume ?? null);
  const [drag, setDrag] = useState<number | null>(null);
  const pending = typeof volume.value === 'number' && volume.pending ? volume.value : null;
  const shown = drag ?? pending ?? reported;
  return (
    <>
      <View className={muted ? 'min-w-0 flex-1 opacity-50' : 'min-w-0 flex-1'}>
        <Slider
          value={shown === null ? null : Math.min(SLIDER_MAX, shown)}
          min={0}
          max={SLIDER_MAX}
          step={1}
          label={`${label} volume`}
          disabled={disabled}
          formatValue={percentText}
          onChange={setDrag}
          onCommit={(level) => {
            setDrag(null);
            background(volume.set(level), 'computer.volume_failed');
          }}
        />
      </View>
      <Text variant="callout" className="tabular w-12 text-right">
        {shown === null ? '--' : percentText(shown)}
      </Text>
    </>
  );
}

function MuteButton({ device, label, disabled, muted }: RowProps): ReactNode {
  const run = useComputerCommand(device);
  return (
    <IconButton
      icon={muted ? 'muted' : 'volume'}
      label={muted ? `Unmute ${label}` : `Mute ${label}`}
      variant={muted ? 'tonal' : 'standard'}
      selected={muted}
      disabled={disabled}
      onPress={() => {
        run('mute', !muted);
      }}
    />
  );
}

export function VolumeRow(row: Omit<RowProps, 'muted'>): ReactNode {
  const muted = useComputerSelect(row.device.id, (parts) => parts.session?.muted === true);
  return (
    <View className="flex-row items-center gap-2">
      <VolumeSlider {...row} muted={muted} />
      <MuteButton {...row} muted={muted} />
    </View>
  );
}
