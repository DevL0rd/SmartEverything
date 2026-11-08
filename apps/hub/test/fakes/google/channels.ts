import type { FakeClock } from './clock';
import { stringField, type JsonObject } from './json';
import { apiFailure, noContent, ok, type Reply } from './reply';

export type ChannelTarget =
  { readonly kind: 'events'; readonly calendarId: string } | { readonly kind: 'calendarList' };

export interface PushNotification {
  readonly channelId: string;
  readonly address: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface ChannelOptions {
  readonly clock: FakeClock;
  readonly maxLifetimeMs: number;
  readonly deliver: ((notification: PushNotification) => void | Promise<void>) | null;
}

export interface ChannelInfo {
  readonly id: string;
  readonly resourceId: string;
  readonly address: string;
  readonly token: string | null;
  readonly expirationMs: number;
  readonly email: string;
  readonly target: ChannelTarget;
}

const MAX_CHANNEL_ID = 64;
const MAX_CHANNEL_TOKEN = 256;
const API = 'https://www.googleapis.com/calendar/v3';

function resourceUri(target: ChannelTarget): string {
  return target.kind === 'events'
    ? `${API}/calendars/${encodeURIComponent(target.calendarId)}/events?alt=json`
    : `${API}/users/me/calendarList?alt=json`;
}

function sameTarget(a: ChannelTarget, b: ChannelTarget): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === 'calendarList' || (b.kind === 'events' && a.calendarId === b.calendarId);
}

function requiredString(body: JsonObject, name: string): string {
  const value = stringField(body, name);
  if (value === undefined || value.length === 0) {
    throw apiFailure(400, `Invalid value for: ${name}`, 'invalid');
  }
  return value;
}

export class ChannelHub {
  readonly notifications: PushNotification[] = [];
  readonly deliveryFailures: unknown[] = [];
  private readonly channels = new Map<string, ChannelInfo>();
  private readonly messageNumbers = new Map<string, number>();
  private readonly pending: Promise<void>[] = [];
  private sequence = 0;
  private readonly options: ChannelOptions;

  constructor(options: ChannelOptions) {
    this.options = options;
  }

  watch(email: string, target: ChannelTarget, body: JsonObject): Reply {
    const id = requiredString(body, 'id');
    const address = requiredString(body, 'address');
    const token = stringField(body, 'token') ?? null;
    if (id.length > MAX_CHANNEL_ID) throw apiFailure(400, 'Channel id is too long.', 'invalid');
    if (token !== null && token.length > MAX_CHANNEL_TOKEN) {
      throw apiFailure(400, 'Channel token is too long.', 'invalid');
    }
    if (body['type'] !== 'web_hook') throw apiFailure(400, 'Invalid value for: type', 'invalid');
    if (!address.startsWith('https://')) {
      throw apiFailure(400, 'WebHook callback channel must be https', 'push.webhookUrlNotHttps');
    }
    if (this.channels.has(id))
      throw apiFailure(400, 'Channel id not unique.', 'channelIdNotUnique');
    const channel: ChannelInfo = {
      id,
      resourceId: `fake-resource-${String((this.sequence += 1))}`,
      address,
      token,
      expirationMs: this.expiration(body['expiration']),
      email,
      target,
    };
    this.channels.set(id, channel);
    this.messageNumbers.set(id, 0);
    this.enqueue(channel, 'sync');
    return ok({
      kind: 'api#channel',
      id,
      resourceId: channel.resourceId,
      resourceUri: resourceUri(target),
      ...(token === null ? {} : { token }),
      expiration: String(channel.expirationMs),
    });
  }

  stop(email: string, body: JsonObject): Reply {
    const id = requiredString(body, 'id');
    const channel = this.channels.get(id);
    if (channel?.email !== email || channel.resourceId !== body['resourceId']) {
      throw apiFailure(404, `Channel '${id}' not found for project`, 'notFound');
    }
    this.channels.delete(id);
    return noContent();
  }

  notify(email: string, target: ChannelTarget): void {
    for (const channel of this.channels.values()) {
      const live = channel.expirationMs > this.options.clock.nowMs();
      if (live && channel.email === email && sameTarget(channel.target, target)) {
        this.enqueue(channel, 'exists');
      }
    }
  }

  active(): readonly ChannelInfo[] {
    return [...this.channels.values()];
  }

  async flush(): Promise<void> {
    while (this.pending.length > 0) {
      await Promise.all(this.pending.splice(0));
    }
  }

  private expiration(requested: unknown): number {
    const ceiling = this.options.clock.nowMs() + this.options.maxLifetimeMs;
    const asked =
      typeof requested === 'string' || typeof requested === 'number' ? Number(requested) : NaN;
    return Number.isFinite(asked) ? Math.min(asked, ceiling) : ceiling;
  }

  private enqueue(channel: ChannelInfo, state: 'sync' | 'exists'): void {
    const number = (this.messageNumbers.get(channel.id) ?? 0) + 1;
    this.messageNumbers.set(channel.id, number);
    const notification: PushNotification = {
      channelId: channel.id,
      address: channel.address,
      headers: {
        'X-Goog-Channel-ID': channel.id,
        'X-Goog-Channel-Expiration': new Date(channel.expirationMs).toUTCString(),
        'X-Goog-Resource-ID': channel.resourceId,
        'X-Goog-Resource-State': state,
        'X-Goog-Resource-URI': resourceUri(channel.target),
        'X-Goog-Message-Number': String(number),
        ...(channel.token === null ? {} : { 'X-Goog-Channel-Token': channel.token }),
      },
    };
    this.notifications.push(notification);
    const deliver = this.options.deliver;
    if (deliver === null) return;
    this.pending.push(
      Promise.resolve()
        .then(() => deliver(notification))
        .catch((error: unknown) => {
          this.reportDeliveryFailure(error);
        }),
    );
  }

  private reportDeliveryFailure(error: unknown): void {
    this.deliveryFailures.push(error);
  }
}
