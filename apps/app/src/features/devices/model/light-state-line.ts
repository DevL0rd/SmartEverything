import { joinParts } from '../../../format/text';

const WARM_UP_TO = 3300;
const NEUTRAL_UP_TO = 4500;

export type LightPower = 'on' | 'off' | 'unknown';

export type LightMode = 'white' | 'colour';

export interface LightLineInput {
  readonly online: boolean;
  readonly seen: string | null;
  readonly power: LightPower;
  readonly level: number | null;
  readonly kelvin: number | null;
  readonly mode: LightMode;
}

export function whiteName(kelvin: number): 'Warm' | 'Neutral' | 'Cool' {
  if (kelvin <= WARM_UP_TO) {
    return 'Warm';
  }
  return kelvin <= NEUTRAL_UP_TO ? 'Neutral' : 'Cool';
}

export function whiteWord(kelvin: number): string {
  return `${whiteName(kelvin)} white`;
}

function toneOf(input: LightLineInput): string | null {
  if (input.mode === 'colour') {
    return 'Colour';
  }
  return input.kelvin === null ? null : whiteWord(input.kelvin);
}

export function lightStateLine(input: LightLineInput, withLevel = true): string {
  if (!input.online) {
    return input.seen === null ? 'Offline' : `Offline · seen ${input.seen}`;
  }
  if (input.power === 'off') {
    return 'Off';
  }
  if (input.power === 'unknown') {
    return 'Online';
  }
  return joinParts([
    'On',
    withLevel && input.level !== null ? `${String(input.level)} %` : null,
    toneOf(input),
  ]);
}
