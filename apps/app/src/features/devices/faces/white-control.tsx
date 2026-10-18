import type { ReactNode } from 'react';
import type { PresentedCapability } from '@smarteverything/domain';
import { LevelSurface } from '../../../components/level-surface';
import { useControl } from '../../../store/control';
import { useLiveControl } from '../../../store/use-live-control';
import { fromKelvin } from '../model/light-state';
import { whiteName } from '../model/light-state-line';
import type { LightView } from './use-light';
import { background } from '@smarteverything/logging';

const COLOUR_MODE = 'Colour mode · tap to use white';

function whiteText(light: LightView): string {
  const { kelvin, mode } = light.state;
  if (mode === 'colour') {
    return COLOUR_MODE;
  }
  return kelvin === null ? 'No white light' : `${String(kelvin)} K · ${whiteName(kelvin)}`;
}

export function WhiteControl({
  light,
  presented,
}: {
  readonly light: LightView;
  readonly presented: PresentedCapability;
}): ReactNode {
  const { device, name, state } = light;
  const raw = useControl(device.id, presented.key);
  const control = useLiveControl(device, presented.key, raw, true);
  return (
    <LevelSurface
      variant="white"
      shape="slim"
      label={`${name} white temperature`}
      value={state.mode === 'colour' ? null : state.kelvin}
      restingValue={state.kelvin}
      valueText={whiteText(light)}
      disabled={!state.online}
      onChange={(kelvin) => {
        background(control.set(fromKelvin(presented, kelvin)), 'control.set_failed');
      }}
    />
  );
}
