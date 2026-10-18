import type { ReactNode } from 'react';
import { View } from 'react-native';
import { familyDefinition } from '@smarteverything/domain';
import { cn } from '../../../design/cn';
import { Glow } from '../../../components/glow';
import { AIR_BAND_COLOUR } from '../../../design/data-colours';
import type { ColourRole } from '../../../design/tokens';
import type { Device } from '../../../store/state';
import {
  DeviceVisual,
  ownsVisualState,
  useDeviceVisualState,
  visualStateOf,
  type VisualSize,
  type VisualState,
} from '../../device-visuals';
import { useDeviceDerived } from '../../../store/selectors';
import { useDeviceModel } from '../model/device-model';

function glowRoleOf(tone: ColourRole | null, state: VisualState): ColourRole | null {
  if (tone === null || !state.online || state.power === 'off') {
    return null;
  }
  return state.band === null ? tone : AIR_BAND_COLOUR[state.band];
}

function useGlowRole(device: Device): ColourRole | null {
  const tone = familyDefinition(useDeviceModel(device).family).glow;
  return useDeviceDerived(
    device.id,
    (values) => glowRoleOf(tone, visualStateOf(device, values)),
    [device, tone],
    Object.is,
  );
}

interface IllustrationProps {
  readonly device: Device;
  readonly size: VisualSize;
}

function HostedIllustration({ device, size }: IllustrationProps): ReactNode {
  const role = useGlowRole(device);
  return (
    <>
      {role === null ? null : <Glow colour={role} />}
      <DeviceVisual device={device} size={size} />
    </>
  );
}

function PlainIllustration({ device, size }: IllustrationProps): ReactNode {
  const tone = familyDefinition(useDeviceModel(device).family).glow;
  const state = useDeviceVisualState(device);
  const role = glowRoleOf(tone, state);
  return (
    <>
      {role === null ? null : <Glow colour={role} />}
      <DeviceVisual device={device} size={size} state={state} />
    </>
  );
}

function Illustration(props: IllustrationProps): ReactNode {
  return ownsVisualState(props.device) ? (
    <HostedIllustration {...props} />
  ) : (
    <PlainIllustration {...props} />
  );
}

export function Visual({
  device,
  size,
}: {
  readonly device: Device;
  readonly size: VisualSize;
}): ReactNode {
  return (
    <View
      pointerEvents="none"
      className={cn(
        'items-center justify-center overflow-hidden bg-surface-3',
        size === 'tile' ? 'rounded-md' : 'rounded-lg',
      )}
    >
      <Illustration device={device} size={size} />
    </View>
  );
}
