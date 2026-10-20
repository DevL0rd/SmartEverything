import type { OpenRgbController, OpenRgbMode } from './transport';

const PER_LED = 'perLedColor';
const MODE_SPECIFIC = 'modeSpecificColor';
const DIRECT_MODE = 'Direct';

type ColourWay = 'leds' | 'mode';

export interface ColourRoute {
  readonly mode: string;
  readonly way: ColourWay;
  readonly switches: boolean;
}

export function takesLedColours(mode: OpenRgbMode): boolean {
  return mode.flagList.includes(PER_LED);
}

export function takesModeColour(mode: OpenRgbMode): boolean {
  return mode.flagList.includes(MODE_SPECIFIC);
}

export function takesColour(mode: OpenRgbMode): boolean {
  return takesLedColours(mode) || takesModeColour(mode);
}

export function activeModeOf(controller: OpenRgbController): OpenRgbMode | undefined {
  return controller.modes[controller.activeMode];
}

function directMode(modes: readonly OpenRgbMode[]): OpenRgbMode | undefined {
  return (
    modes.find((mode) => takesLedColours(mode) && mode.name === DIRECT_MODE) ??
    modes.find(takesLedColours)
  );
}

function ledRoute(mode: OpenRgbMode, active: OpenRgbMode | undefined): ColourRoute {
  return { mode: mode.name, way: 'leds', switches: mode !== active };
}

export function colourRoute(
  controller: OpenRgbController,
  wholeDevice: boolean,
): ColourRoute | null {
  const active = activeModeOf(controller);
  if (active !== undefined && takesLedColours(active)) {
    return ledRoute(active, active);
  }
  if (wholeDevice && active !== undefined && takesModeColour(active)) {
    return { mode: active.name, way: 'mode', switches: false };
  }
  const direct = directMode(controller.modes);
  if (direct !== undefined) {
    return ledRoute(direct, active);
  }
  const specific = wholeDevice ? controller.modes.find(takesModeColour) : undefined;
  return specific === undefined
    ? null
    : { mode: specific.name, way: 'mode', switches: specific !== active };
}
