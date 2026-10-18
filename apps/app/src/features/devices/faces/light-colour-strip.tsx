import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  readPresentedColor,
  writePresentedColor,
  type PresentedCapability,
} from '@smarteverything/domain';
import { ColourStrip, type ColourStripDensity } from '../../../components/colour-strip';
import { useControl, type Control } from '../../../store/control';
import { useLedger } from '../../../store/store-context';
import { LightColourSheet } from '../controls/light-colour-sheet';
import {
  STRIP_SWATCHES,
  matchedPreset,
  presetPlan,
  type PresetPlan,
  type StripKind,
} from '../model/colour-presets';
import { fromKelvin } from '../model/light-state';
import type { LightView } from './use-light';
import { background } from '@smarteverything/logging';

interface Channel {
  readonly part: PresentedCapability;
  readonly control: Control;
}

interface StripProps {
  readonly light: LightView;
  readonly density: ColourStripDensity;
  readonly surface: 'surface-1' | 'surface-2';
}

interface CoreProps extends StripProps {
  readonly kind: StripKind;
  readonly colour: Channel | null;
  readonly temperature: Channel | null;
}

function currentLabel({ state }: LightView): string {
  return state.mode === 'white' && state.kelvin !== null
    ? `${String(state.kelvin)} K white`
    : 'custom colour';
}

function applyPreset(
  plan: PresetPlan,
  colour: Channel | null,
  white: Channel | null,
  turnOn: (() => void) | null,
): void {
  if (plan.turnOn && turnOn !== null) {
    turnOn();
  }
  const { action } = plan;
  if (action.part === 'temperature' && white !== null) {
    background(white.control.set(fromKelvin(white.part, action.kelvin)), 'control.set_failed');
  }
  if (action.part === 'colour' && colour !== null) {
    background(
      colour.control.set(writePresentedColor(colour.part, action.colour)),
      'control.set_failed',
    );
  }
}

function StripCore({ light, kind, density, surface, colour, temperature }: CoreProps): ReactNode {
  const [open, setOpen] = useState(false);
  const ledger = useLedger();
  const powerKey = light.model.power?.key ?? null;
  const turnOn =
    powerKey === null
      ? null
      : (): void => {
          background(ledger.send(light.device, powerKey, true), 'control.set_failed');
        };
  const hsv = colour === null ? null : readPresentedColor(colour.part, colour.control.value);
  const selectedId = matchedPreset(kind, {
    mode: light.state.mode,
    kelvin: light.state.kelvin,
    colour: hsv,
  });
  return (
    <>
      <ColourStrip
        label={`${light.name} colour`}
        swatches={STRIP_SWATCHES[kind]}
        selectedId={selectedId}
        current={
          light.colour === null ? null : { colours: [light.colour], label: currentLabel(light) }
        }
        density={density}
        surface={surface}
        onPick={(id) => {
          const plan = presetPlan(kind, id, temperature !== null, light.state.power === 'off');
          if (plan !== null) {
            applyPreset(plan, colour, temperature, turnOn);
          }
        }}
        onMore={() => {
          setOpen(true);
        }}
      />
      <LightColourSheet
        device={light.device}
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
}

function ColourAndWhite({
  colour,
  temperature,
  ...strip
}: StripProps & {
  readonly colour: PresentedCapability;
  readonly temperature: PresentedCapability;
}): ReactNode {
  const colourControl = useControl(strip.light.device.id, colour.key);
  const temperatureControl = useControl(strip.light.device.id, temperature.key);
  return (
    <StripCore
      {...strip}
      kind="colour"
      colour={{ part: colour, control: colourControl }}
      temperature={{ part: temperature, control: temperatureControl }}
    />
  );
}

function ColourOnly({
  colour,
  ...strip
}: StripProps & { readonly colour: PresentedCapability }): ReactNode {
  const control = useControl(strip.light.device.id, colour.key);
  return (
    <StripCore {...strip} kind="colour" colour={{ part: colour, control }} temperature={null} />
  );
}

function WhiteOnly({
  temperature,
  ...strip
}: StripProps & { readonly temperature: PresentedCapability }): ReactNode {
  const control = useControl(strip.light.device.id, temperature.key);
  return (
    <StripCore {...strip} kind="white" colour={null} temperature={{ part: temperature, control }} />
  );
}

export function LightColourStrip({
  light,
  density = 'full',
  surface = 'surface-1',
}: {
  readonly light: LightView;
  readonly density?: ColourStripDensity;
  readonly surface?: 'surface-1' | 'surface-2';
}): ReactNode {
  const { colour, temperature } = light.parts;
  const strip: StripProps = { light, density, surface };
  if (!light.state.online) {
    return null;
  }
  if (colour !== null && temperature !== null) {
    return <ColourAndWhite {...strip} colour={colour} temperature={temperature} />;
  }
  if (colour !== null) {
    return <ColourOnly {...strip} colour={colour} />;
  }
  return temperature === null ? null : <WhiteOnly {...strip} temperature={temperature} />;
}
