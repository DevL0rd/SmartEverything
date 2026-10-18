import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AudioDevice } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { decimal } from '../../../format/number';
import { deviceIcon, deviceNote, sliderMax } from '../model/audio-model';
import { LevelSlider, MuteToggle } from './level-slider';

export interface DeviceRowProps {
  readonly device: AudioDevice;
  readonly over: boolean;
  readonly offline: boolean;
  readonly wide: boolean;
  readonly onDefault: (device: AudioDevice) => void;
  readonly onVolume: (device: AudioDevice, level: number, failed: () => void) => void;
  readonly onMute: (device: AudioDevice, muted: boolean) => void;
}

function Radio({ on }: { readonly on: boolean }): ReactNode {
  return (
    <View
      className={cn(
        'size-5 items-center justify-center rounded-full border-2',
        on ? 'border-primary' : 'border-outline',
      )}
    >
      {on ? <View className="size-2.5 rounded-full bg-primary" /> : null}
    </View>
  );
}

function Battery({ percent }: { readonly percent: number }): ReactNode {
  return (
    <View className="flex-row items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5">
      <Icon name="battery" size={16} />
      <Text variant="caption">{`${decimal(percent)} %`}</Text>
    </View>
  );
}

function DefaultPick({
  device,
  disabled,
  wide,
  onDefault,
}: Pick<DeviceRowProps, 'device' | 'wide' | 'onDefault'> & {
  readonly disabled: boolean;
}): ReactNode {
  const note = deviceNote(device);
  return (
    <Interactive
      role="radio"
      checked={device.isDefault}
      selected={device.isDefault}
      label={`${device.name}${device.isDefault ? ', default' : ', set as default'}`}
      disabled={disabled}
      onPress={() => {
        onDefault(device);
      }}
      className={cn(
        'min-h-14 flex-row items-center gap-3 rounded-md',
        wide ? 'w-80 shrink-0' : 'flex-1',
      )}
      layerClassName="rounded-md"
    >
      <Radio on={device.isDefault} />
      <Icon name={deviceIcon(device)} size={20} />
      <View className="min-w-0 flex-1">
        <Text variant="body" numberOfLines={2}>
          {device.name}
        </Text>
        <Text variant="caption" tone={note.tone} numberOfLines={1}>
          {note.text}
        </Text>
      </View>
      {device.batteryPercent === null ? null : <Battery percent={device.batteryPercent} />}
    </Interactive>
  );
}

export function DeviceRow(props: DeviceRowProps): ReactNode {
  const { device, over, offline, wide, onDefault, onVolume, onMute } = props;
  const disabled = offline || !device.available;
  const slider = device.available ? (
    <View className={cn('min-w-0 flex-row items-center gap-2', wide ? 'flex-1' : 'pl-8')}>
      <LevelSlider
        label={`${device.name} volume`}
        value={device.volume}
        max={sliderMax(device, over)}
        disabled={disabled}
        muted={device.muted}
        onCommit={(level, failed) => {
          onVolume(device, level, failed);
        }}
        onUnmute={() => {
          onMute(device, false);
        }}
      />
      <MuteToggle
        label={device.name}
        muted={device.muted}
        disabled={disabled}
        onChange={(muted) => {
          onMute(device, muted);
        }}
      />
    </View>
  ) : null;
  return (
    <View
      className={cn(
        'px-3 py-1',
        wide ? 'flex-row items-center gap-3' : 'gap-0',
        device.available ? '' : 'opacity-50',
      )}
    >
      <DefaultPick
        device={device}
        disabled={offline || !device.available}
        wide={wide}
        onDefault={onDefault}
      />
      {slider}
    </View>
  );
}
