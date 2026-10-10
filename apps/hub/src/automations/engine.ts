import {
  AUTOMATION_DEFINITION,
  ApiError,
  GEO_POINT,
  SCENE_ACTIONS,
  TIME_ZONE,
  SIGNAL_SOURCES,
  conditionsHold,
  isTimedTrigger,
  kindSpecOf,
  nextOccurrence,
  type AutomationDefinition,
  type CommandAction,
  type ConditionContext,
  type Place,
  type SignalInput,
  type TimedTrigger,
  type Trigger,
  type WeatherForecast,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import { describeError } from '../commands/executor';
import type { AutomationRecord, HubDatabase } from '../database/port';
import { SignalWatchers, type WatchedTrigger } from '../signals/signal-watchers';
import type { ActionRunner } from './actions';
import { legacyTriggerFires } from './legacy-triggers';
import type { TriggerArmer } from './trigger-armers';

type AutomationStore = Pick<
  HubDatabase,
  'loadHome' | 'loadAutomations' | 'loadScenes' | 'updateAutomation'
>;

export interface AutomationRun {
  readonly automationId: string;
  readonly name: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly error: string | null;
}

export interface AutomationEngineOptions {
  readonly store: AutomationStore;
  readonly recordRun: (run: AutomationRun) => void;
  readonly actions: () => ActionRunner;
  readonly valueOf: ConditionContext['stateOf'];
  readonly forecast: () => WeatherForecast | null;
  readonly armers: readonly TriggerArmer[];
  readonly clock: Clock;
  readonly log: Logger;
}

class UnknownSignalError extends Error {
  override readonly name = 'UnknownSignalError';

  constructor(source: string, kind: string) {
    super(`No signal "${kind}" from "${source}" exists in this home.`);
  }
}

interface Loaded {
  readonly record: AutomationRecord;
  readonly definition: AutomationDefinition;
}

function watchedTriggers(definition: AutomationDefinition): WatchedTrigger[] {
  return definition.triggers.flatMap((trigger) =>
    trigger.type === 'signal'
      ? [{ trigger, pulse: kindSpecOf(SIGNAL_SOURCES, trigger)?.pulse === true }]
      : [],
  );
}

function unknownSignalOf(definition: AutomationDefinition): string | null {
  const unknown = definition.triggers.find(
    (trigger) => trigger.type === 'signal' && kindSpecOf(SIGNAL_SOURCES, trigger) === undefined,
  );
  return unknown?.type === 'signal'
    ? `UnknownSignalError: ${new UnknownSignalError(unknown.source, unknown.kind).message}`
    : null;
}

export class AutomationEngine {
  private automations = new Map<string, Loaded>();
  private scenes = new Map<string, readonly CommandAction[]>();
  private place: Place | null = null;
  private cancels: Cancel[] = [];
  private readonly runCounts = new Map<string, number>();
  private readonly watchers: SignalWatchers;

  constructor(private readonly options: AutomationEngineOptions) {
    this.watchers = new SignalWatchers({
      clock: options.clock,
      fire: (automationId, signal): void => {
        const automation = this.automations.get(automationId);
        if (automation !== undefined) {
          void this.run(automation, signal);
        }
      },
    });
  }

  sceneActions(sceneId: string): readonly CommandAction[] | undefined {
    return this.scenes.get(sceneId);
  }

  async reload(): Promise<void> {
    const [home, automations, scenes] = await Promise.all([
      this.options.store.loadHome(),
      this.options.store.loadAutomations(),
      this.options.store.loadScenes(),
    ]);
    const location = GEO_POINT.safeParse({ latitude: home.latitude, longitude: home.longitude });
    this.place = {
      timeZone: TIME_ZONE.parse(home.timeZone),
      location: location.success ? location.data : null,
    };
    this.scenes = new Map(
      scenes.flatMap((scene) => {
        const actions = SCENE_ACTIONS.safeParse(scene.actions);
        if (!actions.success) {
          this.options.log.warn('scene.invalid', {
            sceneId: scene.id,
            issues: actions.error.issues.length,
          });
          return [];
        }
        return [[scene.id, actions.data] as const];
      }),
    );
    this.automations = new Map(
      (await Promise.all(automations.map((record) => this.loaded(record)))).flat(),
    );
    this.watchers.load(
      [...this.automations.values()].map((automation) => ({
        automationId: automation.record.id,
        triggers: watchedTriggers(automation.definition),
      })),
    );
    this.reschedule();
    this.options.log.info('automations.loaded', {
      automations: this.automations.size,
      scenes: this.scenes.size,
    });
  }

  signal(signal: SignalInput): void {
    this.fire((trigger) => legacyTriggerFires(trigger, signal), signal);
    this.watchers.observe(signal);
  }

  stop(): void {
    this.clearTimers();
    this.watchers.stop();
  }

  private clearTimers(): void {
    for (const cancel of this.cancels) {
      cancel();
    }
    this.cancels = [];
  }

  private async loaded(record: AutomationRecord): Promise<(readonly [string, Loaded])[]> {
    if (!record.enabled) {
      return [];
    }
    const definition = AUTOMATION_DEFINITION.safeParse(record.definition);
    const message = definition.success
      ? unknownSignalOf(definition.data)
      : `InvalidAutomationError: ${definition.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`;
    if (definition.success && message === null) {
      this.runCounts.set(record.id, record.runCount);
      return [[record.id, { record, definition: definition.data }]];
    }
    this.options.log.warn('automation.invalid', { automationId: record.id });
    if (record.lastError !== message) {
      await this.options.store.updateAutomation(record.id, { lastError: message });
    }
    return [];
  }

  private fire(matches: (trigger: Trigger) => boolean, signal: SignalInput): void {
    for (const automation of this.automations.values()) {
      if (automation.definition.triggers.some(matches)) {
        void this.run(automation, signal);
      }
    }
  }

  private reschedule(): void {
    this.clearTimers();
    for (const automation of this.automations.values()) {
      for (const trigger of automation.definition.triggers.filter(isTimedTrigger)) {
        this.schedule(automation, trigger, this.options.clock.now());
      }
      this.arm(automation);
    }
  }

  private arm(automation: Loaded): void {
    for (const trigger of automation.definition.triggers) {
      for (const armer of this.options.armers.filter((entry) =>
        entry.types.includes(trigger.type),
      )) {
        this.cancels.push(
          armer.arm(automation.record.id, trigger, (signal) => {
            void this.run(automation, signal);
          }),
        );
      }
    }
  }

  private schedule(automation: Loaded, trigger: TimedTrigger, after: Date): void {
    const place = this.place;
    if (place === null) {
      return;
    }
    let next: Date | null;
    try {
      next = nextOccurrence(trigger, after, place);
    } catch (cause) {
      void this.recordError(automation, describeError(cause));
      return;
    }
    if (next === null) {
      this.options.log.warn('automation.never_due', {
        automationId: automation.record.id,
        trigger: trigger.type,
      });
      return;
    }
    const due = next;
    this.cancels.push(
      this.options.clock.at(due, () => {
        this.schedule(automation, trigger, due);
        void this.run(automation, null);
      }),
    );
  }

  private conditionsHold(automation: Loaded, place: Place): boolean {
    return conditionsHold(automation.definition.conditions, {
      stateOf: this.options.valueOf,
      now: this.options.clock.now(),
      timeZone: place.timeZone,
      forecast: this.options.forecast(),
      location: place.location,
    });
  }

  async runNow(automationId: string): Promise<void> {
    const record = (await this.options.store.loadAutomations()).find(
      (candidate) => candidate.id === automationId,
    );
    if (record === undefined) {
      throw new ApiError('not_found', `There is no automation ${automationId}.`);
    }
    const definition = AUTOMATION_DEFINITION.safeParse(record.definition);
    if (!definition.success) {
      throw new ApiError(
        'invalid_request',
        `The automation ${record.name} is not valid, so it cannot run: ${definition.error.message}`,
      );
    }
    void this.execute({ record, definition: definition.data }, null);
  }

  private async run(automation: Loaded, signal: SignalInput | null): Promise<void> {
    const place = this.place;
    if (place === null || !this.conditionsHold(automation, place)) {
      return;
    }
    await this.execute(automation, signal);
  }

  private async execute(automation: Loaded, signal: SignalInput | null): Promise<void> {
    const automationId = automation.record.id;
    const run = this.options.log.operation('automation.run', { automationId });
    const startedAt = this.options.clock.now();
    let lastError: string | null = null;
    try {
      await this.options.actions().run(automation.definition.actions, {
        automationId,
        name: automation.record.name,
        signal,
      });
      run.succeeded();
    } catch (cause) {
      lastError = describeError(cause);
      run.failed(cause);
    }
    this.options.recordRun({
      automationId,
      name: automation.record.name,
      startedAt: startedAt.toISOString(),
      durationMs: this.options.clock.now().getTime() - startedAt.getTime(),
      error: lastError,
    });
    const runCount = (this.runCounts.get(automationId) ?? automation.record.runCount) + 1;
    this.runCounts.set(automationId, runCount);
    await this.options.store
      .updateAutomation(automationId, {
        lastRunAt: this.options.clock.now().toISOString(),
        runCount,
        lastError,
      })
      .catch((cause: unknown) => {
        this.options.log.error('automation.run_not_recorded', cause, { automationId });
      });
  }

  private async recordError(automation: Loaded, message: string): Promise<void> {
    this.options.log.warn('automation.not_scheduled', {
      automationId: automation.record.id,
      reason: message,
    });
    if (automation.record.lastError === message) {
      return;
    }
    await this.options.store
      .updateAutomation(automation.record.id, { lastError: message })
      .catch((cause: unknown) => {
        this.options.log.error('automation.error_not_recorded', cause, {
          automationId: automation.record.id,
        });
      });
  }
}
