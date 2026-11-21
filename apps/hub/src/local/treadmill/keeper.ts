import { randomUUID } from 'node:crypto';
import {
  type BeltMode,
  openSummary,
  zoneOffsetSeconds,
  type HeartRateSource,
  type MachineState,
  type SessionSample,
  type SessionSummary,
  type TreadmillSession,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';
import { FigureAccumulator, sameContext, type FigureContext, type SessionFigures } from './figures';

const DEFAULT_CONTEXT: FigureContext = {
  scale: 'unconfirmed',
  weightKg: null,
  runSwitchKmh: 8,
  fixedGradePercent: null,
};

export interface KeeperOptions {
  readonly store: Pick<Store, 'host' | 'settings'>;
  readonly deviceId: string;
  readonly log: Logger;
}

export interface WalkerContext {
  readonly walkerProfileId: string | null;
}

interface Measured {
  readonly figures: SessionFigures;
  readonly heartRateSource: HeartRateSource | null;
}

function sessionOf(
  options: KeeperOptions,
  id: string,
  summary: SessionSummary,
  facts: WalkerContext & Measured,
): TreadmillSession {
  const timeZone = options.store.settings.read().time_zone;
  return {
    ...summary,
    ...facts.figures,
    heartRateSource: facts.heartRateSource,
    id,
    deviceId: options.deviceId,
    walkerProfileId: facts.walkerProfileId,
    zoneOffsetSeconds: zoneOffsetSeconds(timeZone, new Date(summary.startedAt)),
    source: 'live',
  };
}

export class SessionKeeper {
  private activeId: string | null = null;
  private pending: SessionSample[] = [];
  private context: FigureContext = DEFAULT_CONTEXT;
  private accumulator = new FigureAccumulator(DEFAULT_CONTEXT);
  private beltKcal: number | null = null;
  private heartRateSource: HeartRateSource | null = null;

  constructor(private readonly options: KeeperOptions) {}

  get active(): string | null {
    return this.activeId;
  }

  async use(context: FigureContext): Promise<void> {
    if (sameContext(this.context, context)) {
      return;
    }
    this.context = context;
    const accumulator = new FigureAccumulator(context);
    this.accumulator = accumulator;
    if (this.activeId !== null) {
      const stored = await this.options.store.host.call(
        'treadmillSessions',
        'samples',
        this.activeId,
      );
      for (const sample of [...stored, ...this.pending]) {
        accumulator.add(sample);
      }
    }
  }

  figures(): SessionFigures {
    return this.accumulator.figures(this.beltKcal);
  }

  noteHeart(source: HeartRateSource | null): void {
    if (source === 'grips' || (source === 'watch' && this.heartRateSource === null)) {
      this.heartRateSource = source;
    }
  }

  private measured(): Measured {
    return { figures: this.figures(), heartRateSource: this.heartRateSource };
  }

  async begin(
    started: { readonly at: string; readonly mode: BeltMode | null },
    walker: WalkerContext,
  ): Promise<void> {
    const summary: SessionSummary = {
      startedAt: started.at,
      endedAt: started.at,
      activeSeconds: 0,
      pausedSeconds: 0,
      distanceM: 0,
      steps: null,
      kcal: null,
      kcalNet: null,
      avgKmh: 0,
      maxKmh: 0,
      mode: started.mode,
      kind: 'walk',
      zones: { walk: 0, jog: 0, run: 0 },
      splits: [],
    };
    this.activeId = randomUUID();
    this.pending = [];
    this.accumulator = new FigureAccumulator(this.context);
    this.beltKcal = null;
    this.heartRateSource = null;
    await this.options.store.host.write(
      'treadmillOpen',
      sessionOf(this.options, this.activeId, summary, { ...walker, ...this.measured() }),
    );
  }

  tick(sample: SessionSample, beltKcal: number | null): void {
    if (this.activeId !== null) {
      this.pending.push(sample);
      this.accumulator.add(sample);
      this.beltKcal = beltKcal ?? this.beltKcal;
    }
  }

  async flush(machine: MachineState, at: string, walker: WalkerContext): Promise<void> {
    const id = this.activeId;
    const summary = openSummary(machine, at);
    if (id === null || summary === null) {
      return;
    }
    await this.options.store.host.write('treadmillFlush', {
      id,
      samples: this.pending,
      session: sessionOf(this.options, id, summary, { ...walker, ...this.measured() }),
    });
    this.pending = [];
  }

  async finish(summary: SessionSummary, walker: WalkerContext): Promise<TreadmillSession | null> {
    const id = this.activeId;
    this.activeId = null;
    if (id === null) {
      return null;
    }
    const measured = this.measured();
    const { store, log, deviceId } = this.options;
    const session = sessionOf(this.options, id, summary, { ...walker, ...measured });
    const kept = await store.host.write('treadmillFinish', { id, samples: this.pending, session });
    this.pending = [];
    if (!kept) {
      log.info('treadmill.session_discarded', {
        device: deviceId,
        activeSeconds: Math.round(session.activeSeconds),
      });
      return null;
    }
    return session;
  }
}
