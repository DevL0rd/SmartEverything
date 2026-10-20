import {
  climbOf,
  estimateEnergy,
  inclineSummaryOf,
  type InclineScale,
  type KcalSource,
  type SessionSample,
  type TreadmillSession,
  type TreadmillSettings,
} from '@smarteverything/domain';
import type { TreadmillHealth } from './health';
import { weightOf } from './live';
import type { Store } from '../../store/store';

export interface FigureContext {
  readonly scale: InclineScale;
  readonly weightKg: number | null;
  readonly runSwitchKmh: number;
  readonly fixedGradePercent: number | null;
}

export interface SessionFigures {
  readonly kcal: number | null;
  readonly kcalNet: number | null;
  readonly kcalEstimate: number | null;
  readonly climbM: number;
  readonly inclineAvg: number | null;
  readonly inclineMax: number | null;
  readonly inclineSeconds: Readonly<Record<string, number>>;
  readonly kcalSource: KcalSource | null;
}

export function sameContext(first: FigureContext, second: FigureContext): boolean {
  return (
    first.scale === second.scale &&
    first.weightKg === second.weightKg &&
    first.runSwitchKmh === second.runSwitchKmh &&
    first.fixedGradePercent === second.fixedGradePercent
  );
}

export function contextOf(
  settings: TreadmillSettings,
  weightKg: number | null,
  hasIncline: boolean,
): FigureContext {
  return {
    scale: settings.inclineScale,
    weightKg,
    runSwitchKmh: settings.runSwitchKmh,
    fixedGradePercent: hasIncline ? null : settings.gradePercent,
  };
}

export class FigureAccumulator {
  private last: SessionSample | null = null;
  private kcal = 0;
  private kcalNet = 0;
  private climbM = 0;
  private maxIncline: number | null = null;
  private readonly seconds = new Map<string, number>();

  constructor(private readonly context: FigureContext) {}

  add(sample: SessionSample): void {
    const before = this.last;
    this.last = sample;
    if (before === null) {
      return;
    }
    const pair = [before, sample];
    const { weightKg } = this.context;
    if (weightKg !== null) {
      const energy = estimateEnergy(pair, { ...this.context, weightKg });
      this.kcal += energy.kcal;
      this.kcalNet += energy.kcalNet;
    }
    this.climbM += climbOf(pair, this.context.scale);
    const incline = inclineSummaryOf(pair);
    for (const [key, value] of Object.entries(incline.seconds)) {
      this.seconds.set(key, (this.seconds.get(key) ?? 0) + value);
    }
    if (incline.max !== null) {
      this.maxIncline = Math.max(this.maxIncline ?? 0, incline.max);
    }
  }

  figures(beltKcal: number | null): SessionFigures {
    const total = [...this.seconds.values()].reduce((sum, value) => sum + value, 0);
    const weighted = [...this.seconds].reduce((sum, [key, value]) => sum + Number(key) * value, 0);
    const shared = {
      climbM: this.climbM,
      inclineAvg: total > 0 ? weighted / total : null,
      inclineMax: this.maxIncline,
      inclineSeconds: Object.fromEntries(this.seconds),
    };
    const known = this.context.weightKg !== null;
    const kcalNet = known ? this.kcalNet : null;
    const kcalEstimate = known ? this.kcal : null;
    if (beltKcal !== null && beltKcal > 0) {
      return { ...shared, kcal: beltKcal, kcalNet, kcalEstimate, kcalSource: 'belt' };
    }
    return known
      ? { ...shared, kcal: this.kcal, kcalNet, kcalEstimate, kcalSource: 'estimate' }
      : { ...shared, kcal: null, kcalNet: null, kcalEstimate: null, kcalSource: null };
  }
}

export function figuresOf(
  samples: readonly SessionSample[],
  context: FigureContext,
  beltKcal: number | null,
): SessionFigures {
  const accumulator = new FigureAccumulator(context);
  for (const sample of samples) {
    accumulator.add(sample);
  }
  return accumulator.figures(beltKcal);
}

export interface RecomputeDeps {
  readonly store: Pick<Store, 'treadmillSessions' | 'bodyReadings' | 'write'>;
  readonly health: Pick<TreadmillHealth, 'save'>;
}

export function recomputeSessions(
  deps: RecomputeDeps,
  deviceId: string,
  settings: TreadmillSettings,
  hasIncline: boolean,
): TreadmillSession[] {
  const changed: TreadmillSession[] = [];
  for (const session of deps.store.treadmillSessions.finished(deviceId, undefined)) {
    const samples = deps.store.treadmillSessions.samples(session.id);
    if (samples.length < 2) {
      continue;
    }
    const context = contextOf(settings, weightOf(deps.store, session.walkerProfileId), hasIncline);
    const belt = session.kcalSource === 'belt' ? session.kcal : null;
    const updated: TreadmillSession = { ...session, ...figuresOf(samples, context, belt) };
    deps.store.write(() => {
      deps.store.treadmillSessions.save(updated, true);
    });
    deps.health.save(updated);
    changed.push(updated);
  }
  return changed;
}
