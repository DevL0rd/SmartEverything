import {
  APP_EVENT_DEVICE_KINDS,
  APP_EVENT_STATES,
  appEventSummary,
  type AdapterSink,
  type AppEvent,
  type ComputerScopes,
  type ComputerSessionState,
  type JsonValue,
  type NodeHello,
  type SessionApp,
  type SignalInput,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { SignalBus } from '../signals/bus';
import { AppEventBudget } from './app-event-budget';
import { computerExternalId } from './computer-device';

const BUDGET_CAPACITY = 40;
const BUDGET_PER_SECOND = 1;

export interface AppPresenceOptions {
  readonly sink: Pick<AdapterSink, 'event'>;
  readonly signals: Pick<SignalBus, 'emit'>;
  readonly personOf: (deviceId: string) => string | null;
  readonly now: () => Date;
  readonly log: Logger;
}

export interface AppPresenceComputer {
  readonly externalId: string;
  readonly deviceId: string;
  readonly user: string | null;
  readonly personId: string | null;
}

export interface AppPresenceView {
  readonly deviceId: string;
  readonly hello: Pick<NodeHello, 'machineId'>;
  readonly parts: { readonly session?: Pick<ComputerSessionState, 'user'> | undefined };
  readonly scopes: Pick<ComputerScopes, 'apps' | 'app_events'>;
}

export interface AppPresenceHost {
  readonly view: () => AppPresenceView | null;
}

export interface AppPresenceBatch {
  readonly at: string;
  readonly baseline: boolean;
  readonly events: readonly AppEvent[];
}

function identityOf(
  event: AppEvent,
  computer: AppPresenceComputer,
): Readonly<Record<string, JsonValue>> {
  return {
    app: event.app.name,
    appId: event.app.id,
    ...(event.title === null ? {} : { title: event.title }),
    ...(computer.user === null ? {} : { user: computer.user }),
    ...(computer.personId === null ? {} : { personId: computer.personId }),
  };
}

function detailsOf(
  event: AppEvent,
  computer: AppPresenceComputer,
): Readonly<Record<string, JsonValue>> {
  return {
    summary: appEventSummary(event.kind, event.app.name),
    topic: event.app.name,
    ...identityOf(event, computer),
  };
}

function stateSignal(
  event: AppEvent,
  computer: AppPresenceComputer,
  at: string,
  value: boolean,
): SignalInput {
  return {
    source: 'computer',
    kind: APP_EVENT_STATES[event.kind].kind,
    subject: computer.deviceId,
    field: event.app.id,
    value,
    previous: null,
    at,
    profileId: computer.personId,
    data: identityOf(event, computer),
  };
}

function permitted(view: AppPresenceView): boolean {
  return view.scopes.apps && view.scopes.app_events;
}

export class AppPresence {
  private readonly open = new Map<string, SessionApp>();
  private front: SessionApp | null = null;
  private readonly budget: AppEventBudget;

  constructor(
    private readonly options: AppPresenceOptions,
    private readonly host: AppPresenceHost,
  ) {
    this.budget = new AppEventBudget({
      capacity: BUDGET_CAPACITY,
      perSecond: BUDGET_PER_SECOND,
      now: (): number => options.now().getTime(),
    });
  }

  receive(batch: AppPresenceBatch): void {
    const view = this.host.view();
    if (view === null || !permitted(view)) {
      this.options.log.debug('computer.app_events_dropped', {});
      return;
    }
    const computer = this.computerOf(view);
    if (batch.baseline) {
      this.reconcile(batch, computer);
      return;
    }
    for (const event of batch.events) {
      this.track(event, computer, batch.at);
      this.record(event, computer, batch.at);
    }
  }

  revalidate(): void {
    const view = this.host.view();
    if (view !== null && !permitted(view)) this.end();
  }

  end(): void {
    if (this.front === null && this.open.size === 0) return;
    const view = this.host.view();
    if (view === null) return;
    const computer = this.computerOf(view);
    const at = this.options.now().toISOString();
    const closing: AppEvent[] = [
      ...(this.front === null
        ? []
        : [{ kind: 'unfocused' as const, app: this.front, title: null }]),
      ...[...this.open.values()].map((app) => ({ kind: 'closed' as const, app, title: null })),
    ];
    for (const event of closing) {
      this.track(event, computer, at);
    }
  }

  private computerOf(view: AppPresenceView): AppPresenceComputer {
    return {
      externalId: computerExternalId(view.hello.machineId),
      deviceId: view.deviceId,
      user: view.parts.session?.user ?? null,
      personId: this.options.personOf(view.deviceId),
    };
  }

  private reconcile(batch: AppPresenceBatch, computer: AppPresenceComputer): void {
    const wanted = new Set(
      batch.events.flatMap((event) => (event.kind === 'opened' ? [event.app.id] : [])),
    );
    const front = batch.events.find((event) => event.kind === 'focused');
    const stale: AppEvent[] = [
      ...(this.front === null || this.front.id === front?.app.id
        ? []
        : [{ kind: 'unfocused' as const, app: this.front, title: null }]),
      ...[...this.open.values()]
        .filter((app) => !wanted.has(app.id))
        .map((app) => ({ kind: 'closed' as const, app, title: null })),
    ];
    for (const event of [...stale, ...batch.events]) {
      this.track(event, computer, batch.at);
    }
  }

  private track(event: AppEvent, computer: AppPresenceComputer, at: string): void {
    const { kind, value } = APP_EVENT_STATES[event.kind];
    if (kind === 'app_focus') {
      this.front = value ? event.app : null;
    } else if (value) {
      this.open.set(event.app.id, event.app);
    } else {
      this.open.delete(event.app.id);
    }
    this.options.signals.emit(stateSignal(event, computer, at, value));
  }

  private record(event: AppEvent, computer: AppPresenceComputer, at: string): void {
    const decision = this.budget.take();
    if (!decision.allowed) {
      if (decision.skipped === 1) {
        this.options.log.warn('computer.app_events_limited', {
          externalId: computer.externalId,
          reason: 'too many app events in a short time',
        });
      }
      return;
    }
    if (decision.skipped > 0) {
      this.options.log.warn('computer.app_events_resumed', {
        externalId: computer.externalId,
        skipped: decision.skipped,
      });
    }
    this.options.sink.event({
      externalId: computer.externalId,
      kind: APP_EVENT_DEVICE_KINDS[event.kind],
      occurredAt: at,
      details: detailsOf(event, computer),
    });
  }
}
