import type {
  InclineScale,
  PadPreferences,
  PadSensitivity,
  RemoteStartWho,
  TreadmillFamily,
  TreadmillPolicy,
} from '@smarteverything/domain';
import { decimal } from '../../../format/number';

export const WHO_OPTIONS: readonly { readonly value: RemoteStartWho; readonly label: string }[] = [
  { value: 'owner', label: 'Owner only' },
  { value: 'owner_and_walker', label: 'Owner and walker' },
];

export const SENSITIVITY_OPTIONS: readonly {
  readonly value: PadSensitivity;
  readonly label: string;
}[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

export interface ConfirmText {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
}

export function remoteStartConfirm(policy: TreadmillPolicy): ConfirmText {
  const who = policy.remoteWho === 'owner' ? 'the owner' : 'the owner and the person walking';
  return {
    title: 'Allow remote start?',
    body: `Then ${who} can start the belt from another phone, an automation or the assistant, even when nobody is near it. Remote speed-ups are capped at ${decimal(policy.remoteMaxKmh, 1)} km/h. Stop and pause always work for everyone.`,
    confirmLabel: 'Allow remote start',
  };
}

export type PadLayout = 'full' | 'supplement' | 'none';

export function padLayoutOf(family: TreadmillFamily): PadLayout {
  switch (family) {
    case 'wilink':
      return 'full';
    case 'ftms_supplement':
      return 'supplement';
    case 'ftms':
    case 'ftms_odm':
      return 'none';
  }
}

export interface ReadOnlyFact {
  readonly label: string;
  readonly value: string;
}

export function supplementFacts(pad: PadPreferences): readonly ReadOnlyFact[] {
  const facts: ReadOnlyFact[] = [];
  if (pad.autoStopSeconds !== undefined) {
    facts.push({
      label: 'Auto-stop when you step off',
      value: pad.autoStopSeconds === 0 ? 'Off' : `${String(pad.autoStopSeconds)} s`,
    });
  }
  if (pad.ledColor !== undefined) {
    facts.push({ label: 'LED colour', value: `Preset ${String(pad.ledColor)}` });
  }
  if (pad.paceDisplay !== undefined) {
    facts.push({ label: 'Show pace', value: pad.paceDisplay ? 'On' : 'Off' });
  }
  if (pad.units !== undefined) {
    facts.push({ label: 'Units on the belt', value: pad.units === 'km' ? 'Kilometres' : 'Miles' });
  }
  return facts;
}

export function lubricationLine(maintenance: {
  readonly dueInDays: number | null;
  readonly beltKmSince: number;
}): string {
  const { dueInDays, beltKmSince } = maintenance;
  const km = `${decimal(beltKmSince, 1)} km since the last oiling`;
  if (dueInDays === null) {
    return `Not marked yet · ${km}`;
  }
  if (dueInDays <= 0) {
    return `Due now · ${km}`;
  }
  return `Next in ${String(dueInDays)} days · ${km}`;
}

export const INCLINE_SCALE_OPTIONS: readonly {
  readonly value: InclineScale;
  readonly label: string;
}[] = [
  { value: 'unconfirmed', label: 'Not confirmed' },
  { value: 'percent', label: 'Percent (the belt’s number is the grade)' },
  { value: 'levels', label: 'Levels (each level is half a percent)' },
];

export const INCLINE_SCALE_SUBTITLE =
  'The belt’s number is the grade. A reading of 10 is a 10 percent slope.';

export const INCLINE_CALIBRATION_NOTE =
  'Raise the belt to its top incline. Put a phone level app on the deck. About 6 degrees means levels. About 11 degrees means percent. Until then climb and calories use the lower reading.';

export const INCLINE_ZERO_REASON =
  'The belt reported no incline range, so there is nothing to set.';

const SCALE_WORD = {
  unconfirmed: 'on the belt’s scale',
  percent: 'percent',
  levels: 'levels',
} as const;

export function remoteInclineConfirm(cap: number, scale: InclineScale): ConfirmText {
  const word = SCALE_WORD[scale];
  return {
    title: 'Allow remote incline?',
    body: `Then another phone, an automation or the assistant can raise the incline up to ${decimal(cap, 0)} ${word}, one step at a time, only while someone is walking. Lowering is always allowed. Stop always works.`,
    confirmLabel: 'Allow remote incline',
  };
}

export interface StepLimits {
  readonly minKmh: number;
  readonly maxKmh: number;
  readonly stepKmh: number;
}

export function remoteSpeedRange(limits: StepLimits): {
  readonly min: number;
  readonly max: number;
  readonly step: number;
} {
  return { min: limits.minKmh, max: limits.maxKmh, step: limits.stepKmh };
}

export function minimumSpeedLine(minKmh: number): string {
  return `Lowest value is the belt’s minimum, ${decimal(minKmh, 1)} km/h.`;
}

export function lightStripSubtitle(light: boolean | undefined): string {
  return light === undefined
    ? 'Waiting for the belt to report its state'
    : 'Follows what the belt reports; a switch that does not change was refused';
}
