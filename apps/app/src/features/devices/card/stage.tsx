import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DeviceFamily } from '@smarteverything/domain';
import { cn } from '../../../design/cn';
import { Glow } from '../../../components/glow';
import { AIR_BAND_COLOUR } from '../../../design/data-colours';
import type { ColourRole } from '../../../design/tokens';
import type { Device } from '../../../store/state';
import { DeviceVisual, useDeviceVisualState, type VisualSize } from '../../device-visuals';
import { useDeviceModel } from '../model/device-model';

const FAMILY_ROLE: Readonly<Partial<Record<DeviceFamily, ColourRole>>> = {
  humidifier: 'humidity',
  dehumidifier: 'humidity',
  tower_fan: 'temp-cool',
  fan: 'temp-cool',
  heater: 'temp-warm',
  air_conditioner: 'temp-cool',
  thermostat: 'temp-warm',
  light: 'temp-warm',
};

function useGlowRole(device: Device): ColourRole | null {
  const model = useDeviceModel(device);
  const state = useDeviceVisualState(device);
  if (!state.online || state.power === 'off') {
    return null;
  }
  return state.band === null
    ? (FAMILY_ROLE[model.family] ?? 'primary')
    : AIR_BAND_COLOUR[state.band];
}

export function Visual({
  device,
  size,
}: {
  readonly device: Device;
  readonly size: VisualSize;
}): ReactNode {
  const role = useGlowRole(device);
  return (
    <View
      pointerEvents="none"
      className={cn(
        'items-center justify-center overflow-hidden bg-surface-3',
        size === 'tile' ? 'rounded-md' : 'rounded-lg',
      )}
    >
      {role === null ? null : <Glow colour={role} />}
      <DeviceVisual device={device} size={size} />
    </View>
  );
}
