import type { AdapterSink } from '@smarteverything/domain';
import {
  INSTALLED_APP,
  isOnlineHealth,
  INSTALLED_SUBSCRIPTION_LIST,
  nextPageOf,
  planSubscriptions,
  reconcileSubscriptions,
  type InstalledSubscription,
  type SubscriptionPlan,
  type WebhookEvent,
  type WebhookEventEntry,
} from '@smarteverything/smartthings';
import type { RunContext } from '../contract';
import { SmartThingsHttpError, type SmartThingsApi } from './http';
import type { Inventory } from './inventory';
import { TokenRefusedError, type TokenKeeper } from './tokens';
import type { SmartThingsWebhooks } from './webhooks';

const FIRST_RETRY_MS = 1000;

const LONGEST_RETRY_MS = 60_000;

const TRANSIENT_STATUSES: ReadonlySet<number> = new Set([408, 429]);

export class EventsRefusedError extends Error {
  override readonly name = 'EventsRefusedError';

  constructor(readonly reason: string) {
    super(`SmartThings refused the event subscriptions: ${reason}.`);
  }
}

class SubscriptionsIncompleteError extends Error {
  override readonly name = 'SubscriptionsIncompleteError';

  constructor(plan: SubscriptionPlan) {
    const parts = [
      ...(plan.uncoveredCapabilities.length === 0
        ? []
        : [`no events for ${plan.uncoveredCapabilities.join(', ')}, past the 40 subscriptions`]),
      ...(plan.otherLocationDevices.length === 0
        ? []
        : [
            `no events for ${plan.otherLocationDevices.join(', ')}, which are in another location than the one SmartThings was linked for`,
          ]),
    ];
    super(`SmartThings delivers only part of the events: ${parts.join('; ')}.`);
  }
}

export interface EventSubscriptionsOptions {
  readonly api: SmartThingsApi;
  readonly tokens: TokenKeeper;
  readonly inventory: Inventory;
  readonly context: RunContext;
  readonly webhooks: SmartThingsWebhooks;
  readonly sink: AdapterSink;
  readonly rediscover: () => Promise<void>;
}

function refusalOf(cause: unknown): EventsRefusedError | null {
  if (cause instanceof EventsRefusedError) {
    return cause;
  }
  if (
    cause instanceof SmartThingsHttpError &&
    cause.status >= 400 &&
    cause.status < 500 &&
    !TRANSIENT_STATUSES.has(cause.status)
  ) {
    return new EventsRefusedError(`HTTP ${String(cause.status)} ${cause.description}`);
  }
  return null;
}

export class EventSubscriptions {
  private syncing: Promise<void> = Promise.resolve();
  private detach: (() => void) | null = null;
  private retryMs = FIRST_RETRY_MS;
  private retry: NodeJS.Timeout | null = null;
  private stopped = false;
  private base = '';

  constructor(private readonly options: EventSubscriptionsOptions) {}

  start(): void {
    const installedAppId = this.options.tokens.installedAppId;
    if (installedAppId === null) {
      this.syncing = this.refuse(
        new EventsRefusedError(
          'the token response carried no installed_app_id, which the subscriptions need',
        ),
      );
      return;
    }
    this.base = `/v1/installedapps/${installedAppId}`;
    this.detach = this.options.webhooks.attach(installedAppId, (entries) => {
      this.receive(entries);
    });
    this.resync();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.detach?.();
    this.detach = null;
    if (this.retry !== null) {
      clearTimeout(this.retry);
      this.retry = null;
    }
    await this.syncing;
  }

  private resync(): void {
    this.syncing = this.syncing.then(() => this.syncOnce());
  }

  private async syncOnce(): Promise<void> {
    if (this.stopped) {
      return;
    }
    try {
      await this.sync();
      this.retryMs = FIRST_RETRY_MS;
    } catch (cause) {
      await this.failed(cause);
    }
  }

  private async failed(cause: unknown): Promise<void> {
    if (cause instanceof TokenRefusedError) {
      return;
    }
    const refusal = refusalOf(cause);
    if (refusal !== null) {
      await this.refuse(refusal);
      return;
    }
    this.options.context.log.warn('events.subscribe_failed', {
      reason: String(cause),
      retryInMs: this.retryMs,
    });
    const delay = this.retryMs;
    this.retryMs = Math.min(this.retryMs * 2, LONGEST_RETRY_MS);
    this.retry = setTimeout(() => {
      this.retry = null;
      this.resync();
    }, delay);
  }

  private async refuse(refusal: EventsRefusedError): Promise<void> {
    const { context, sink } = this.options;
    sink.failure({
      provider: 'smartthings',
      externalId: null,
      operation: 'events.subscribe',
      cause: refusal,
    });
    await context.needsAttention(refusal);
  }

  private async sync(): Promise<void> {
    const { api, inventory, context, sink } = this.options;
    const base = this.base;
    const app = INSTALLED_APP.parse(await api.request({ method: 'GET', path: base }));
    const plan = planSubscriptions(app.locationId, inventory.subscriptionSources);
    const changes = reconcileSubscriptions(await this.installed(base), plan.requests);
    for (const id of changes.remove) {
      await api.request({ method: 'DELETE', path: `${base}/subscriptions/${id}` });
    }
    for (const request of changes.create) {
      await api.request({ method: 'POST', path: `${base}/subscriptions`, body: request });
    }
    context.log.info('events.subscribed', {
      scheme: plan.scheme,
      subscriptions: plan.requests.length,
      created: changes.create.length,
      removed: changes.remove.length,
    });
    if (plan.uncoveredCapabilities.length > 0 || plan.otherLocationDevices.length > 0) {
      sink.failure({
        provider: 'smartthings',
        externalId: null,
        operation: 'events.subscribe',
        cause: new SubscriptionsIncompleteError(plan),
      });
    }
  }

  private async installed(base: string): Promise<readonly InstalledSubscription[]> {
    const items: InstalledSubscription[] = [];
    let path: string | null = `${base}/subscriptions`;
    while (path !== null) {
      const page = INSTALLED_SUBSCRIPTION_LIST.parse(
        await this.options.api.request({ method: 'GET', path }),
      );
      items.push(...page.items);
      path = nextPageOf(page);
    }
    return items;
  }

  private receive(entries: readonly WebhookEventEntry[]): void {
    const { sink, context } = this.options;
    for (const entry of entries) {
      if (entry.kind === 'event') {
        this.dispatch(entry.event);
      } else if (entry.kind === 'unreadable') {
        sink.failure({
          provider: 'smartthings',
          externalId: null,
          operation: 'events.read',
          cause: entry.error,
        });
      } else {
        context.log.debug('events.ignored', { eventType: entry.eventType });
      }
    }
  }

  private dispatch(event: WebhookEvent): void {
    const { sink, inventory, context } = this.options;
    const at = new Date(event.eventTime).toISOString();
    switch (event.eventType) {
      case 'DEVICE_EVENT': {
        const events = inventory.eventsFor(event.deviceEvent, at);
        inventory.applyEvent(event.deviceEvent, at).forEach((update) => {
          sink.state(update);
        });
        events.forEach((deviceEvent) => {
          sink.event(deviceEvent);
        });
        return;
      }
      case 'DEVICE_HEALTH_EVENT':
        sink.online(
          event.deviceHealthEvent.deviceId,
          isOnlineHealth(event.deviceHealthEvent.status),
        );
        return;
      case 'DEVICE_LIFECYCLE_EVENT':
        context.log.info('device.lifecycle_changed', {
          externalId: event.deviceLifecycleEvent.deviceId,
          lifecycle: event.deviceLifecycleEvent.lifecycle,
        });
        void this.options.rediscover().then(() => {
          this.resync();
        });
    }
  }
}
