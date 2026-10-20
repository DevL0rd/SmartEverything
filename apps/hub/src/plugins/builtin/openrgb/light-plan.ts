import {
  CommandRefusedError,
  HSV_COLOR,
  checkValue,
  type DeviceCommand,
} from '@smarteverything/domain';
import { z } from 'zod';
import { BLACK, filled, rgbOfLook, type Look, type Rgb } from './colour-math';
import {
  MIN_BRIGHTNESS,
  unitCapabilities,
  type LightUnit,
  type UnitState,
} from './controller-device';
import { colourRoute, takesLedColours, takesModeColour } from './modes';
import type { OpenRgbController } from './transport';

export type LightStep =
  | { readonly kind: 'leds'; readonly zone: number | null; readonly colours: readonly Rgb[] }
  | { readonly kind: 'mode'; readonly name: string; readonly colours: readonly Rgb[] | null };

export interface LightPlan {
  readonly steps: readonly LightStep[];
  readonly state: UnitState;
  readonly mode: string;
}

const COMMAND_KEYS = ['power', 'brightness', 'color', 'light_effect'] as const;

interface Colour {
  readonly hue: number;
  readonly saturation: number;
  readonly value: number;
}

function ledStep(unit: LightUnit, colour: Rgb): LightStep {
  return { kind: 'leds', zone: unit.zone, colours: filled(colour, unit.count) };
}

function shown(state: UnitState): Rgb {
  return state.on ? rgbOfLook(state.look) : BLACK;
}

function colourPlan(
  info: OpenRgbController,
  unit: LightUnit,
  state: UnitState,
  capability: string,
): LightPlan {
  const route = colourRoute(info, unit.zone === null);
  if (route === null) {
    throw new CommandRefusedError(capability, 'this light has no mode that takes a colour');
  }
  if (route.way === 'mode') {
    return {
      steps: [{ kind: 'mode', name: route.mode, colours: [shown(state)] }],
      state,
      mode: route.mode,
    };
  }
  const switching: LightStep[] = route.switches
    ? [{ kind: 'mode', name: route.mode, colours: null }]
    : [];
  return { steps: [...switching, ledStep(unit, shown(state))], state, mode: route.mode };
}

function effectPlan(
  info: OpenRgbController,
  unit: LightUnit,
  state: UnitState,
  name: string,
): LightPlan {
  const mode = info.modes.find((candidate) => candidate.name === name);
  if (mode === undefined) {
    throw new CommandRefusedError('light_effect', `this light has no mode named ${name}`);
  }
  if (takesLedColours(mode)) {
    const steps: LightStep[] = [{ kind: 'mode', name, colours: null }, ledStep(unit, shown(state))];
    return { steps, state, mode: name };
  }
  if (takesModeColour(mode)) {
    return { steps: [{ kind: 'mode', name, colours: [shown(state)] }], state, mode: name };
  }
  return {
    steps: [{ kind: 'mode', name, colours: null }],
    state: { ...state, on: true },
    mode: name,
  };
}

function withLook(state: UnitState, change: Partial<Look>): UnitState {
  return { on: true, look: { ...state.look, ...change } };
}

function withColour(state: UnitState, colour: Colour): UnitState {
  if (colour.value === 0) {
    return { ...state, on: false };
  }
  return withLook(state, {
    hue: colour.hue,
    saturation: colour.saturation,
    brightness: Math.max(MIN_BRIGHTNESS, Math.round(colour.value)),
  });
}

export function planLightCommand(
  info: OpenRgbController,
  unit: LightUnit,
  state: UnitState,
  command: DeviceCommand,
): LightPlan {
  const capability = unitCapabilities(info, unit).find((entry) => entry.key === command.capability);
  if (capability === undefined) {
    throw new CommandRefusedError(
      command.capability,
      'this OpenRGB light does not support that control',
    );
  }
  const value = checkValue(capability.value, command.value);
  const key = z.enum(COMMAND_KEYS).parse(command.capability);
  switch (key) {
    case 'power':
      return colourPlan(info, unit, { ...state, on: z.boolean().parse(value) }, key);
    case 'brightness':
      return colourPlan(info, unit, withLook(state, { brightness: z.number().parse(value) }), key);
    case 'color':
      return colourPlan(info, unit, withColour(state, HSV_COLOR.parse(value)), key);
    case 'light_effect':
      return effectPlan(info, unit, state, z.string().parse(value));
  }
}
