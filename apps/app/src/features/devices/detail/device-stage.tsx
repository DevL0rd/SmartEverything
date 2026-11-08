import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { isLiveControl, levelPercent, levelValue } from '@smarteverything/domain';
import { LevelSurface } from '../../../components/level-surface';
import { cn } from '../../../design/cn';
import { useControl } from '../../../store/control';
import { useLiveControl } from '../../../store/use-live-control';
import type { Device } from '../../../store/state';
import { DeviceVisual, useVisualPx } from '../../device-visuals';
import { HeroInspectContext } from '../../models';
import { powerStateOf, useDeviceModel } from '../model/device-model';
import { useDeviceValues } from '../../../store/selectors';
import { useDisplayName } from '../model/display-name';
import { stageLevelOf, type StageLevel } from './stage-level';
import { background } from '@smarteverything/logging';

const NARROW_STAGE = { box: 'min-h-61', surface: 'h-61' } as const;
const WIDE_STAGE = { box: 'min-h-76', surface: 'h-76' } as const;

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
  const [inspecting, setInspecting] = useState(false);
  const stage = useVisualPx('hero') === 280 ? WIDE_STAGE : NARROW_STAGE;
  return (
    <View className={cn('items-center pt-3', stage.box)}>
      <View className={cn('absolute inset-x-0 top-0 overflow-hidden rounded-lg', stage.surface)}>
        <LevelSurface
          shape="fill"
          thumb="full"
          restingValue={value === null ? null : levelPercent(level.range, value)}
          value={on && value !== null ? levelPercent(level.range, value) : null}
          label={`${name} ${level.presented.label}`}
          disabled={!device.online || inspecting}
          onChange={(percent, phase) => {
            if (live || phase === 'commit') {
              background(control.set(levelValue(level.range, percent)), 'control.set_failed');
            }
          }}
        />
      </View>
      <HeroInspectContext value={setInspecting}>
        <View pointerEvents="box-none">
          <DeviceVisual device={device} size="hero" interactive />
        </View>
      </HeroInspectContext>
    </View>
  );
}

export function DeviceStage({ device }: { readonly device: Device }): ReactNode {
  const level = stageLevelOf(useDeviceModel(device));
  return level === null ? (
    <DeviceVisual device={device} size="hero" interactive />
  ) : (
    <DimmerStage device={device} level={level} />
  );
}
