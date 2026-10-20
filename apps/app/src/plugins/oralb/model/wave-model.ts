import {
  ORALB_MODES,
  ORALB_MODE_ANGLES,
  ORALB_MODE_LABELS,
  type BrushLiveFrame,
  type BrushMode,
  type OralbMode,
} from '@smarteverything/domain';

export const MAX_ANGLE = 35;

export const CYCLE_PX = 22;

export const POINTS_PER_CYCLE = 12;

export const DEFAULT_SHARE = 0.55;

export const EASED_SHARE = 0.55;

export type Envelope = 'steady' | 'pulsed' | 'alternating';

export const ENVELOPE: Readonly<Record<OralbMode, Envelope>> = {
  daily_clean: 'steady',
  sensitive: 'steady',
  gum_care: 'pulsed',
  whiten: 'alternating',
  intense: 'steady',
  super_sensitive: 'steady',
  tongue_clean: 'steady',
  smart_adapt: 'steady',
  gentle_white: 'steady',
};

const GROUP: Readonly<Record<Envelope, number>> = { steady: 1, pulsed: 4, alternating: 2 };

export function oralbModeOf(mode: BrushMode | null): OralbMode | null {
  return ORALB_MODES.find((known) => known === mode) ?? null;
}

export type AngleSource = 'live' | 'nominal' | 'none';

export interface Angle {
  readonly degrees: number | null;
  readonly source: AngleSource;
}

export function angleOf(
  frame: Pick<BrushLiveFrame, 'angleDeg' | 'liveSource' | 'mode'>,
  connected: boolean,
): Angle {
  if (connected && frame.angleDeg !== null) {
    return { degrees: frame.angleDeg, source: 'live' };
  }
  const mode = oralbModeOf(frame.mode);
  const nominal = mode === null ? undefined : ORALB_MODE_ANGLES[mode];
  return nominal === undefined
    ? { degrees: null, source: 'none' }
    : { degrees: nominal, source: 'nominal' };
}

export function amplitudeShare(angle: Angle, tooHard: boolean): number {
  const base = angle.degrees === null ? DEFAULT_SHARE : Math.min(1, angle.degrees / MAX_ANGLE);
  return tooHard && angle.source === 'live' ? base * EASED_SHARE : base;
}

export function groupOf(mode: OralbMode | null): number {
  return GROUP[mode === null ? 'steady' : ENVELOPE[mode]];
}

function factorOf(envelope: Envelope, cycle: number): number {
  switch (envelope) {
    case 'steady':
      return 1;
    case 'pulsed':
      return cycle % 4 === 3 ? 0.12 : 1;
    case 'alternating':
      return cycle % 2 === 1 ? 0.55 : 1;
  }
}

export function wavePath(
  width: number,
  height: number,
  share: number,
  mode: OralbMode | null,
): string {
  const envelope = mode === null ? 'steady' : ENVELOPE[mode];
  const cycles = Math.ceil(width / CYCLE_PX);
  const middle = height / 2;
  const reach = (height / 2 - 2) * Math.min(1, Math.max(0, share));
  const steps = cycles * POINTS_PER_CYCLE;
  const commands: string[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const cycle = Math.min(cycles - 1, Math.floor(step / POINTS_PER_CYCLE));
    const phase = ((step % POINTS_PER_CYCLE) / POINTS_PER_CYCLE) * Math.PI * 2;
    const x = (step / POINTS_PER_CYCLE) * CYCLE_PX;
    const y = middle - Math.sin(phase) * reach * factorOf(envelope, cycle);
    commands.push(`${step === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return commands.join(' ');
}

export function scrollPx(mode: OralbMode | null): number {
  return groupOf(mode) * CYCLE_PX;
}

export function drawnWidth(visible: number, mode: OralbMode | null): number {
  return visible + scrollPx(mode);
}

export function angleText(angle: Angle): string | null {
  return angle.degrees === null ? null : `${String(Math.round(angle.degrees))}°`;
}

export function angleTag(angle: Angle): string | null {
  switch (angle.source) {
    case 'live':
      return 'live';
    case 'nominal':
      return 'nominal';
    case 'none':
      return null;
  }
}

const SHAPE_TEXT: Readonly<Record<Envelope, string>> = {
  steady: 'steady',
  pulsed: 'pulsed in groups of three',
  alternating: 'alternating high and low',
};

export function modeBlurb(mode: BrushMode | null, angle: Angle): string | null {
  const known = oralbModeOf(mode);
  if (known === null) {
    return null;
  }
  const nominal =
    angle.degrees === null
      ? ''
      : `, ${String(Math.round(angle.degrees))}° ${angle.source === 'live' ? 'now' : 'nominal'}`;
  return `${SHAPE_TEXT[ENVELOPE[known]]}${nominal}`;
}

export function restLine(mode: BrushMode | null, angle: Angle): string {
  const known = oralbModeOf(mode);
  const blurb = modeBlurb(mode, angle);
  return known === null || blurb === null
    ? 'Pick a mode on the handle'
    : `${ORALB_MODE_LABELS[known]} · ${blurb}`;
}

export function waveLabel(mode: BrushMode | null, angle: Angle, tooHard: boolean): string {
  const known = oralbModeOf(mode);
  const name = known === null ? 'Drive' : ORALB_MODE_LABELS[known];
  const shape = known === null ? 'steady' : SHAPE_TEXT[ENVELOPE[known]];
  const degrees = angleText(angle);
  const reading = degrees === null ? '' : `, ${degrees} ${angleTag(angle) ?? ''}`.trimEnd();
  return `${name} drive, ${shape}${reading}${tooHard ? ', easing off because you press too hard' : ''}`;
}

export const EASE_NOTE = 'the brush eases off when you press too hard';

export const TONGUE_STOP_S = 30;
