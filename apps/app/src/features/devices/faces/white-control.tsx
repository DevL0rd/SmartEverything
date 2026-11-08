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

function whiteText(light: LightView, compact: boolean): string {
  const { kelvin, mode } = light.state;
  if (mode === 'colour') {
    return compact ? 'Tap for white' : COLOUR_MODE;
  }
  return kelvin === null ? 'No white light' : `${String(kelvin)} K · ${whiteName(kelvin)}`;
}

export function WhiteControl({
  light,
  presented,
  compact = false,
  className,
}: {
  readonly light: LightView;
  readonly presented: PresentedCapability;
  readonly compact?: boolean | undefined;
  readonly className?: string;
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
      valueText={whiteText(light, compact)}
      disabled={!state.online}
      className={className}
      onChange={(kelvin) => {
        background(control.set(fromKelvin(presented, kelvin)), 'control.set_failed');
      }}
    />
  );
}
