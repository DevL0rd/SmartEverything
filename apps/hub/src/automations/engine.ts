import {
  AUTOMATION_V2,
  GEO_POINT,
  TIME_ZONE,
  automationSignalErrorV2,
  nextOccurrence,
  timedTriggerOf,
  type AutomationRow,
  type AutomationV2,
  type Place,
  type SignalInput,
  type SignalSourceSpec,
  type TimedTrigger,
  type TriggerV2,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import { SignalWatchers } from '../signals/signal-watchers';
import type { Store } from '../store/store';
import { DuplicateSpeechOccurrenceError } from '../store/repositories/speech';
import { subjectOf, type AutomationRunner } from './run-task';
import type { TriggerAdmission, TriggerArmer } from './trigger-armers';
import { watchedTriggers, weatherFieldsOf, weatherLevelSignals } from './triggers';
import type { AutomationWorld } from './world';
import { failureLine } from '@smarteverything/logging';

interface AutomationEngineOptions {
  readonly store: Store;
  readonly runner: Pick<AutomationRunner, 'start'>;
  readonly world: Pick<AutomationWorld, 'holds'>;
  readonly armers: readonly TriggerArmer[];
  readonly sources: () => readonly SignalSourceSpec[];
  readonly stopRuns: () => void;
  readonly clock: Clock;
  readonly log: Logger;
}

interface Loaded {
  readonly row: AutomationRow;
  readonly definition: AutomationV2;
}

function problemOf(
  parsed: ReturnType<typeof AUTOMATION_V2.safeParse>,
  sources: readonly SignalSourceSpec[],
): string | null {
  if (!parsed.success)
    return `InvalidAutomationError: ${parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')}`;
  const error = automationSignalErrorV2(sources, parsed.data);
  return error === null ? null : `${error.name}: ${error.message}`;
}

export class AutomationEngine {
  private automations = new Map<string, Loaded>();
  private place: Place | null = null;
  private weatherFields: ReadonlySet<string> = new Set();
  private cancels: Cancel[] = [];
  private readonly watchers: SignalWatchers;

  constructor(private readonly options: AutomationEngineOptions) {
    this.watchers = new SignalWatchers({
      clock: options.clock,
      fire: (automationId, signal): void => {
        const automation = this.automations.get(automationId);
        if (automation !== undefined) {
          this.run(automation, signal);
        }
      },
    });
  }

  reload(): void {
    const { store, log } = this.options;
    const settings = store.settings.read();
    const location = GEO_POINT.safeParse({
      latitude: settings.latitude,
      longitude: settings.longitude,
    });
    this.place = {
      timeZone: TIME_ZONE.parse(settings.time_zone),
      location: location.success ? location.data : null,
    };
    const sources = this.options.sources();
    this.automations = new Map(
      store.automations.list().flatMap((row) => this.loaded(row, sources)),
    );
    const definitions = [...this.automations.values()].map((automation) => automation.definition);
    this.weatherFields = weatherFieldsOf(definitions);
    this.watchers.load(
      [...this.automations.values()].map((automation) => ({
        automationId: automation.row.id,
        triggers: watchedTriggers(automation.definition, sources),
      })),
    );
    this.reschedule();
    log.info('automations.loaded', {
      automations: this.automations.size,
      enabledRows: this.automations.size,
      timers: this.cancels.length,
      timeZone: this.place.timeZone,
      hasLocation: this.place.location !== null,
    });
  }

  signal(signal: SignalInput): void {
    this.watchers.observe(signal);
    for (const level of weatherLevelSignals(signal, this.weatherFields)) {
      this.watchers.observe(level);
    }
  }

  stop(): void {
    this.clearTimers();
    this.watchers.stop();
    this.options.stopRuns();
  }

  private clearTimers(): void {
    for (const cancel of this.cancels) {
      cancel();
    }
    this.cancels = [];
  }

  private loaded(
    row: AutomationRow,
    sources: readonly SignalSourceSpec[],
  ): (readonly [string, Loaded])[] {
    if (!row.enabled) {
      return [];
    }
    const parsed = AUTOMATION_V2.safeParse(row.definition);
    const problem = problemOf(parsed, sources);
    if (parsed.success && problem === null) {
      return [[row.id, { row, definition: parsed.data }]];
    }
    this.options.log.warn('automation.invalid', {
      automationId: row.id,
      parsed: parsed.success,
      reason: problem ?? undefined,
    });
    this.recordError(row, problem ?? 'InvalidAutomationError');
    return [];
  }

  private reschedule(): void {
    this.clearTimers();
    for (const automation of this.automations.values()) {
      for (const trigger of automation.definition.when) {
        const timed = timedTriggerOf(trigger);
        if (timed !== null) this.schedule(automation, timed, this.options.clock.now());
        this.arm(automation, trigger);
      }
    }
  }

  private arm(automation: Loaded, trigger: TriggerV2): void {
    for (const armer of this.options.armers.filter((entry) => entry.types.includes(trigger.on))) {
      this.cancels.push(
        armer.arm(automation.row.id, trigger, (signal, admission) => {
          this.run(automation, signal, admission);
        }),
      );
    }
  }

  private upcoming(trigger: TimedTrigger, after: Date, place: Place): Date | null {
    const next = nextOccurrence(trigger, after, place);
    const now = this.options.clock.now();
    return next !== null && next.getTime() <= now.getTime()
      ? nextOccurrence(trigger, now, place)
      : next;
  }

  private schedule(automation: Loaded, trigger: TimedTrigger, after: Date): void {
    const { place } = this;
    if (place === null) {
      return;
    }
    let next: Date | null;
    try {
      next = this.upcoming(trigger, after, place);
    } catch (cause) {
      this.recordError(automation.row, failureLine(cause));
      return;
    }
    if (next === null) {
      this.options.log.warn('automation.never_due', {
        automationId: automation.row.id,
        trigger: trigger.type,
      });
      return;
    }
    const due = next;
    this.options.log.debug('automation.scheduled', () => ({
      automationId: automation.row.id,
      trigger: trigger.type,
      dueAt: due.toISOString(),
      inMs: due.getTime() - this.options.clock.now().getTime(),
    }));
    this.cancels.push(
      this.options.clock.at(due, () => {
        this.schedule(automation, trigger, due);
        this.run(automation, null);
      }),
    );
  }

  private run(automation: Loaded, signal: SignalInput | null, admission?: TriggerAdmission): void {
    const { runner, world } = this.options;
    const { row, definition } = automation;
    try {
      if (definition.onlyIf !== undefined && !world.holds(definition.onlyIf, {})) {
        this.options.log.debug('automation.skipped', () => ({
          automationId: row.id,
          reason: 'only_if_false',
          trigger: signal === null ? 'timer' : `${signal.source}:${signal.kind}`,
        }));
        return;
      }
      this.options.log.debug('automation.triggered', () => ({
        automationId: row.id,
        trigger: signal === null ? 'timer' : `${signal.source}:${signal.kind}`,
        admitted: admission !== undefined,
      }));
      runner.start({
        subject: subjectOf(row),
        definition,
        trigger: signal,
        inputs: {},
        lasting: true,
        ...(admission === undefined
          ? {}
          : { admit: admission.validate, occurrence: admission.occurrence }),
      });
    } catch (cause) {
      if (cause instanceof DuplicateSpeechOccurrenceError) {
        this.options.log.debug('automation.skipped', {
          automationId: row.id,
          reason: 'duplicate_speech_occurrence',
        });
      } else {
        this.options.log.error('automation.start_failed', cause, { automationId: row.id });
        this.recordError(row, failureLine(cause));
      }
    }
  }

  private recordError(row: AutomationRow, message: string): void {
    const { store, log } = this.options;
    log.warn('automation.not_scheduled', { automationId: row.id, reason: message });
    if (row.last_error === message) {
      return;
    }
    try {
      store.automations.recordRun(row.id, { lastError: message });
    } catch (cause) {
      log.error('automation.error_not_recorded', cause, { automationId: row.id });
    }
  }
}
