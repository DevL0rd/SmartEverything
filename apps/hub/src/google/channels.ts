import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { GoogleSyncState } from '@smarteverything/domain';
import { classifyApiFailure } from '@smarteverything/google';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { Cancel, Clock } from '../clock';
import { GoogleCallError } from '../planner/google/calendar-run';
import type { FetchLike } from '../plugins/builtin/fetch-like';
import type { Store } from '../store/store';
import type { GoogleSyncRunner } from './sync-runner';
import type { GoogleTokens } from './tokens';

const log = new Logger('hub.google');

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

const WATCH_REPLY = z.looseObject({
  id: z.string().min(1),
  resourceId: z.string().min(1),
  expiration: z.string().regex(/^\d+$/),
});

export function channelToken(key: Uint8Array, channelId: string): string {
  return createHmac('sha256', key).update(channelId).digest('hex');
}

export function validChannelToken(
  key: Uint8Array,
  channelId: string,
  presented: string | null,
): boolean {
  if (presented === null) return false;
  const expected = Buffer.from(channelToken(key, channelId));
  const actual = Buffer.from(presented);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function pushPath(channelId: string): string {
  return `/api/google/push/${encodeURIComponent(channelId)}`;
}

export interface GoogleChannelsOptions {
  readonly store: Pick<Store, 'googleAccounts' | 'googleSyncState' | 'settings'>;
  readonly tokens: Pick<GoogleTokens, 'accessToken' | 'invalidate'>;
  readonly runner: Pick<GoogleSyncRunner, 'sync' | 'onSynced'>;
  readonly fetch: FetchLike;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly key: Uint8Array;
}

interface Armed {
  readonly channelId: string;
  readonly cancel: Cancel;
}

function resourceKey(
  state: Pick<GoogleSyncState, 'profile_id' | 'product' | 'resource_id'>,
): string {
  return `${state.profile_id}|${state.product}|${state.resource_id}`;
}

export class GoogleChannels {
  private readonly armed = new Map<string, Armed>();
  private detach: (() => void) | null = null;

  constructor(private readonly options: GoogleChannelsOptions) {}

  start(): void {
    this.detach = this.options.runner.onSynced((profileId) => this.ensure(profileId));
    for (const account of this.options.store.googleAccounts.list()) {
      if (account.status !== 'linked') continue;
      for (const state of this.calendars(account.profile_id)) this.arm(state);
    }
  }

  stop(): void {
    this.detach?.();
    this.detach = null;
    for (const entry of this.armed.values()) entry.cancel();
    this.armed.clear();
  }

  async ensure(profileId: string): Promise<void> {
    if (this.base() === null) return;
    if (this.options.store.googleAccounts.find(profileId)?.status !== 'linked') return;
    for (const state of this.calendars(profileId)) {
      if (state.channel !== null) {
        this.arm(state);
        continue;
      }
      await this.open(state);
    }
  }

  async release(profileId: string): Promise<void> {
    for (const state of this.calendars(profileId)) {
      this.disarm(state);
      if (state.channel === null) continue;
      await this.close(state, state.channel);
      const fresh = this.options.store.googleSyncState.find(this.resource(state));
      if (fresh !== undefined) this.options.store.googleSyncState.put({ ...fresh, channel: null });
    }
  }

  private calendars(profileId: string): GoogleSyncState[] {
    return this.options.store.googleSyncState
      .forProfile(profileId)
      .filter((state) => state.product === 'calendar');
  }

  private resource(state: GoogleSyncState): {
    readonly profileId: string;
    readonly product: 'calendar';
    readonly resourceId: string;
  } {
    return { profileId: state.profile_id, product: 'calendar', resourceId: state.resource_id };
  }

  private base(): string | null {
    const { public_url, public_url_verified_at } = this.options.store.settings.read();
    if (public_url === null || public_url_verified_at === null) return null;
    return public_url.replace(/\/+$/, '');
  }

  private arm(state: GoogleSyncState): void {
    const { channel } = state;
    const key = resourceKey(state);
    if (channel === null) return;
    const existing = this.armed.get(key);
    if (existing?.channelId === channel.channel_id) return;
    existing?.cancel();
    const cancel = this.options.clock.at(new Date(channel.expires_at), () => {
      this.armed.delete(key);
      this.renew(state).catch((cause: unknown) => {
        log.error('google.channel_renew_failed', cause, { profileId: state.profile_id });
      });
    });
    this.armed.set(key, { channelId: channel.channel_id, cancel });
  }

  private disarm(state: GoogleSyncState): void {
    const key = resourceKey(state);
    this.armed.get(key)?.cancel();
    this.armed.delete(key);
  }

  private async renew(expired: GoogleSyncState): Promise<void> {
    const state = this.options.store.googleSyncState.find(this.resource(expired));
    if (state === undefined) return;
    if (state.channel?.channel_id !== expired.channel?.channel_id) return;
    this.options.store.googleSyncState.put({ ...state, channel: null });
    if (this.base() === null) {
      log.warn('google.channel_lapsed', { profileId: state.profile_id });
      return;
    }
    await this.open({ ...state, channel: null });
    await this.options.runner.sync(state.profile_id, 'reconcile');
  }

  private async open(state: GoogleSyncState): Promise<void> {
    const base = this.base();
    if (base === null) return;
    const channelId = randomUUID();
    try {
      const reply = await this.call(
        state.profile_id,
        `${CALENDAR_API}/calendars/${encodeURIComponent(state.resource_id)}/events/watch`,
        {
          id: channelId,
          type: 'web_hook',
          address: `${base}${pushPath(channelId)}`,
          token: channelToken(this.options.key, channelId),
        },
        WATCH_REPLY,
      );
      const fresh = this.options.store.googleSyncState.find(this.resource(state));
      if (fresh === undefined) return;
      const stored = this.options.store.googleSyncState.put({
        ...fresh,
        channel: {
          channel_id: reply.id,
          resource_id: reply.resourceId,
          expires_at: new Date(Number(reply.expiration)).toISOString(),
        },
      });
      this.arm(stored);
      log.info('google.channel_opened', {
        profileId: state.profile_id,
        expiresAt: stored.channel?.expires_at ?? null,
      });
    } catch (cause) {
      log.error('google.channel_open_failed', cause, { profileId: state.profile_id });
    }
  }

  private async close(
    state: GoogleSyncState,
    channel: NonNullable<GoogleSyncState['channel']>,
  ): Promise<void> {
    try {
      await this.call(
        state.profile_id,
        `${CALENDAR_API}/channels/stop`,
        { id: channel.channel_id, resourceId: channel.resource_id },
        z.null(),
      );
    } catch (cause) {
      log.warn('google.channel_stop_failed', {
        profileId: state.profile_id,
        reason: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  private async call<T>(
    profileId: string,
    url: string,
    body: unknown,
    schema: z.ZodType<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const token = await this.options.tokens.accessToken(profileId);
      const response = await this.options.fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      const parsed: unknown = text === '' ? null : JSON.parse(text);
      if (response.ok) return schema.parse(parsed);
      const failure = classifyApiFailure(response.status, parsed);
      if (failure.kind !== 'unauthorized' || attempt > 0) throw new GoogleCallError(failure);
      this.options.tokens.invalidate(profileId);
    }
  }
}
