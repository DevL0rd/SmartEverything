import type { ReactNode } from 'react';
import { View } from 'react-native';
import { isLiveControl, levelPercent, levelValue } from '@smarteverything/domain';
import { LevelSurface } from '../../../components/level-surface';
import { useControl } from '../../../store/control';
import { useLiveControl } from '../../../store/use-live-control';
import type { Device } from '../../../store/state';
import { DeviceVisual } from '../../device-visuals';
import { powerStateOf, useDeviceModel } from '../model/device-model';
import { useDeviceValues } from '../../../store/selectors';
import { useDisplayName } from '../model/display-name';
import { stageLevelOf, type StageLevel } from './stage-level';
import { background } from '@smarteverything/logging';

function DimmerStage({
  device,
  level,
}: {
  readonly device: Device;
  readonly level: StageLevel;
}): ReactNode {
  const model = useDeviceModel(device);
  const values = useDeviceValues(device.id);
  const name = useDisplayName(device.id);
  const raw = useControl(device.id, level.presented.key);
  const live = isLiveControl(level.presented);
  const control = useLiveControl(device, level.presented.key, raw, live);
  const on = powerStateOf(model, values) === 'on';
  const value = typeof control.value === 'number' ? control.value : null;
  return (
    <View className="relative items-center justify-center overflow-hidden rounded-lg py-4">
      <LevelSurface
        shape="fill"
        thumb="full"
        restingValue={value === null ? null : levelPercent(level.range, value)}
        value={on && value !== null ? levelPercent(level.range, value) : null}
        label={`${name} ${level.presented.label}`}
        disabled={!device.online}
        onChange={(percent, phase) => {
          if (live || phase === 'commit') {
            background(control.set(levelValue(level.range, percent)), 'control.set_failed');
          }
        }}
      />
      <View pointerEvents="none">
        <DeviceVisual device={device} size="hero" />
      </View>
    </View>
  );
}

export function DeviceStage({ device }: { readonly device: Device }): ReactNode {
  const level = stageLevelOf(useDeviceModel(device));
  return level === null ? (
    <DeviceVisual device={device} size="hero" />
  ) : (
    <DimmerStage device={device} level={level} />
  );
}
