import {
  ORALB_PROBES,
  ORALB_RING_COLOURS,
  ORALB_RING_NAMES,
  oralbRingDisplayOf,
  type BrushStateView,
  type OralbProbe,
  type OralbRingName,
  type OralbSettings,
} from '@smarteverything/domain';

export type ProbeStatus = 'passed' | 'failed' | 'stale' | 'none';

export function probeStatus(
  settings: Pick<OralbSettings, 'probes'>,
  probe: OralbProbe,
  firmware: number | null,
): ProbeStatus {
  const result = settings.probes[probe];
  if (result === undefined) {
    return 'none';
  }
  if ('failedAt' in result) {
    return 'failed';
  }
  return result.firmware === firmware ? 'passed' : 'stale';
}

export function passedCount(
  settings: Pick<OralbSettings, 'probes'>,
  firmware: number | null,
): number {
  return ORALB_PROBES.filter((probe) => probeStatus(settings, probe, firmware) === 'passed').length;
}

export type WriteKey = 'pacer' | 'quarter' | 'modes' | 'ring' | 'head';

export const WRITE_PROBE: Readonly<Record<WriteKey, OralbProbe>> = {
  pacer: 'pacer_write',
  quarter: 'pacer_write',
  modes: 'mode_order_write',
  ring: 'ring_write',
  head: 'head_reset_write',
};

export const WRITE_PROBES: readonly OralbProbe[] = [
  'pacer_write',
  'mode_order_write',
  'ring_write',
  'head_reset_write',
  'clock_write',
];

export function writeOpen(
  settings: OralbSettings,
  key: WriteKey,
  firmware: number | null,
): boolean {
  return probeStatus(settings, WRITE_PROBE[key], firmware) === 'passed';
}

export function anyWritePassed(settings: OralbSettings, firmware: number | null): boolean {
  return WRITE_PROBES.some((probe) => probeStatus(settings, probe, firmware) === 'passed');
}

export const LOCK_NOTICE =
  'Changing the brush is off until a safe test on your brush passes (Diagnostics below).';

export interface Gate {
  readonly open: boolean;
  readonly reason: string | null;
}

export function gateOf(
  settings: OralbSettings,
  key: WriteKey,
  firmware: number | null,
  consent: boolean,
): Gate {
  if (!writeOpen(settings, key, firmware)) {
    return { open: false, reason: 'its handle test has not passed' };
  }
  return consent
    ? { open: true, reason: null }
    : { open: false, reason: 'changing the brush is not allowed yet' };
}

export const QUARTER_RANGE = { min: 15, max: 60, step: 5 } as const;

export function quarterTarget(seconds: number, quarters: number): string {
  const total = seconds * quarters;
  return `${String(seconds)} s per quarter, ${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')} target`;
}

export interface Cost {
  readonly live: 1 | 2 | 3;
  readonly battery: 1 | 2 | 3;
}

export interface LiveChoice {
  readonly value: OralbSettings['live'];
  readonly label: string;
  readonly detail: string;
  readonly cost: Cost;
}

export const LIVE_CHOICES: readonly LiveChoice[] = [
  {
    value: 'broadcast',
    label: 'Broadcast',
    detail: 'Keeps the Oral-B app free. Timer, quarter and pressure state.',
    cost: { live: 2, battery: 1 },
  },
  {
    value: 'connected',
    label: 'Connected',
    detail: 'Adds force and the drive wave. The Oral-B app cannot connect meanwhile.',
    cost: { live: 3, battery: 3 },
  },
];

export const HEAD_WARN_RANGE = { min: 0, max: 60, step: 1 } as const;

export const HEAD_DUE_RANGE = { min: 0, max: 30, step: 1 } as const;

export interface DaysBar {
  readonly due: number;
  readonly warn: number;
}

export function daysBarOf(warnDays: number, dueDays: number, baseline: number): DaysBar {
  const span = Math.max(1, baseline);
  return {
    due: Math.min(1, dueDays / span),
    warn: Math.min(1, Math.max(dueDays, warnDays) / span),
  };
}

export function ringSwatches(): readonly { readonly name: OralbRingName; readonly hex: string }[] {
  return ORALB_RING_NAMES.map((name) => ({
    name,
    hex: `#${oralbRingDisplayOf(ORALB_RING_COLOURS[name])
      .map((level) => level.toString(16).padStart(2, '0'))
      .join('')}`,
  }));
}

export interface TestContext {
  readonly link: Pick<BrushStateView['link'], 'phase'>;
  readonly frame: Pick<BrushStateView['frame'], 'activity'>;
}

export function canTest(
  probe: OralbProbe,
  view: TestContext,
): { readonly allowed: boolean; readonly reason: string | null } {
  if (probe === 'advert_log') {
    return { allowed: true, reason: null };
  }
  if (view.frame.activity === 'brushing' || view.frame.activity === 'paused') {
    return { allowed: false, reason: 'The brush is in use. Run the test after brushing.' };
  }
  return view.link.phase === 'linked'
    ? { allowed: true, reason: null }
    : { allowed: false, reason: 'Lift the brush near this phone so it links, then run the test.' };
}
