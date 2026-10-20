export const INCLINE_SCALES = ['unconfirmed', 'percent', 'levels'] as const;

export type InclineScale = (typeof INCLINE_SCALES)[number];

export const LEVEL_GRADE_PERCENT = 0.5;

export const DEFAULT_REMOTE_INCLINE_MAX = 5;

export interface InclineSample {
  readonly t: number;
  readonly distanceM: number;
  readonly incline: number | null;
  readonly state: 'running' | 'paused';
}

export interface InclineSummary {
  readonly avg: number | null;
  readonly max: number | null;
  readonly seconds: Readonly<Record<string, number>>;
}

export interface InclineRange {
  readonly inclineMinPercent: number | null;
  readonly inclineMaxPercent: number | null;
  readonly inclineStepPercent: number | null;
}

export interface InclinePolicy {
  readonly remoteIncline: boolean;
  readonly remoteInclineMax: number;
}

export interface InclineRequest {
  readonly target: number;
  readonly current: number | null;
}

export interface InclineCaller {
  readonly owner: boolean;
  readonly walker: boolean;
  readonly remote: boolean;
  readonly held: boolean;
  readonly stepsSeen: boolean;
}

export type InclineVerdict =
  | { readonly allowed: true; readonly step: number; readonly final: number }
  | { readonly allowed: false; readonly reason: string };

const PRECISION = 1e6;

const GRADE_DIVISOR = 100;

export function gradeOf(raw: number | null | undefined, scale: InclineScale): number {
  if (raw === null || raw === undefined || raw <= 0) {
    return 0;
  }
  return scale === 'percent' ? raw : raw * LEVEL_GRADE_PERCENT;
}

export function climbOf(samples: readonly InclineSample[], scale: InclineScale): number {
  let climb = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const before = samples[index - 1];
    const after = samples[index];
    if (before !== undefined && after !== undefined && after.distanceM > before.distanceM) {
      climb +=
        ((after.distanceM - before.distanceM) * gradeOf(before.incline, scale)) / GRADE_DIVISOR;
    }
  }
  return climb;
}

function inclineSpans(
  samples: readonly InclineSample[],
): { readonly incline: number; readonly span: number }[] {
  const spans: { incline: number; span: number }[] = [];
  samples.forEach((before, index) => {
    const after = samples[index + 1];
    if (before.incline !== null && before.state === 'running' && after !== undefined) {
      spans.push({ incline: before.incline, span: Math.max(after.t - before.t, 0) });
    }
  });
  return spans;
}

export function inclineSummaryOf(samples: readonly InclineSample[]): InclineSummary {
  const spans = inclineSpans(samples);
  const seconds: Record<string, number> = {};
  for (const { incline, span } of spans) {
    seconds[String(incline)] = (seconds[String(incline)] ?? 0) + span;
  }
  const total = spans.reduce((sum, { span }) => sum + span, 0);
  const weighted = spans.reduce((sum, { incline, span }) => sum + incline * span, 0);
  const max = spans.length > 0 ? Math.max(...spans.map(({ incline }) => incline)) : null;
  return { avg: total > 0 ? weighted / total : null, max, seconds };
}

function snap(value: number, min: number, step: number): number {
  return Math.round((min + Math.round((value - min) / step) * step) * PRECISION) / PRECISION;
}

function refuse(reason: string): InclineVerdict {
  return { allowed: false, reason };
}

function remoteReason(final: number, current: number, policy: InclinePolicy): string | null {
  if (!policy.remoteIncline) {
    return 'Change the incline from the phone that holds the link, or ask the owner to allow remote incline in the treadmill settings.';
  }
  return final > current && final > policy.remoteInclineMax
    ? `Remote incline is capped at ${String(policy.remoteInclineMax)} in the treadmill settings.`
    : null;
}

function presenceReason(caller: InclineCaller): string | null {
  if (caller.stepsSeen || (!caller.remote && caller.held)) {
    return null;
  }
  return caller.remote
    ? 'Nobody is walking on the belt, so the incline is not changed remotely.'
    : 'Nobody is walking on the belt. Hold the button to change the incline.';
}

function accessReason(
  final: number,
  current: number,
  policy: InclinePolicy,
  caller: InclineCaller,
): string | null {
  if (!caller.owner && !caller.walker) {
    return 'Only the owner or the person on the belt can change the incline.';
  }
  const remote = caller.remote ? remoteReason(final, current, policy) : null;
  return remote ?? presenceReason(caller);
}

function rangeOf(identity: InclineRange): { min: number; max: number; step: number } | null {
  const { inclineMinPercent: min, inclineMaxPercent: max, inclineStepPercent: step } = identity;
  return min === null || max === null || step === null || step <= 0 ? null : { min, max, step };
}

export function inclineVerdict(
  request: InclineRequest,
  identity: InclineRange,
  policy: InclinePolicy,
  caller: InclineCaller,
): InclineVerdict {
  const range = rangeOf(identity);
  if (range === null) {
    return refuse('The belt did not report its incline range.');
  }
  const { current } = request;
  if (current === null) {
    return refuse('The belt has not reported its incline yet.');
  }
  if (request.target < range.min || request.target > range.max) {
    return refuse(`The incline must be between ${String(range.min)} and ${String(range.max)}.`);
  }
  const final = snap(request.target, range.min, range.step);
  if (final === current) {
    return refuse(`The incline is already ${String(current)}.`);
  }
  const reason = accessReason(final, current, policy, caller);
  if (reason !== null) {
    return refuse(reason);
  }
  const up = final > current;
  const next = up ? Math.min(current + range.step, final) : Math.max(current - range.step, final);
  return { allowed: true, step: Math.round(next * PRECISION) / PRECISION, final };
}
