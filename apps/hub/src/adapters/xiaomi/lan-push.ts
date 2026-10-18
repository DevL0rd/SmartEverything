import type { Logger } from '@smarteverything/logging';
import {
  SUBSCRIBE_METHOD,
  UNSUBSCRIBE_METHOD,
  checkSubscription,
  needsSubscription,
  parseUplink,
  statusNoticeId,
  subscriptionParams,
  uplinkAck,
  type MiioHeader,
  type LegacyChildEvent,
  type ProbeReply,
  type PushOffer,
  type Uplink,
} from '@smarteverything/xiaomi';
import type { XiaomiTiming } from './dependencies';
import { RepeatLog } from '../../providers/repeat-log';
import { MiioTimeoutError, type MiioClient } from './miio-client';
import { background, failureLine } from '@smarteverything/logging';

const MILLISECONDS_PER_SECOND = 1000;
const JITTER_SPAN = 0.2;
const SEEN_LIMIT = 256;

export type PushState =
  | { readonly kind: 'probing' }
  | { readonly kind: 'subscribed'; readonly since: number }
  | { readonly kind: 'unsupported'; readonly reason: string }
  | { readonly kind: 'lost'; readonly reason: string };

export interface PushListener {
  readonly subscribed: () => void;
  readonly uplink: (uplink: Uplink) => void;
  readonly childUplink?: (uplink: LegacyChildEvent) => (() => void) | null;
  readonly changed: (state: PushState) => void;
  readonly lost: (reason: string) => void;
  readonly returned: () => void;
}

export interface LanPushOptions {
  readonly did: string;
  readonly host: string;
  readonly client: MiioClient;
  readonly virtualDid: bigint;
  readonly timing: XiaomiTiming;
  readonly now: () => number;
  readonly jitter: () => number;
  readonly log: Logger;
}

export class LanPush {
  private current: PushState = { kind: 'probing' };
  private subscribedAt: number | null = null;
  private interval: number;
  private missed = 0;
  private answeredOnce = false;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private readonly seen = new Map<string, number>();
  private readonly repeat: RepeatLog;
  private duplicates = 0;

  constructor(
    private readonly options: LanPushOptions,
    private readonly listener: PushListener,
  ) {
    this.interval = options.timing.keepAliveMinMs;
    this.repeat = new RepeatLog(options.log);
  }

  get state(): PushState {
    return this.current;
  }

  start(): void {
    this.options.client.onUplink((body, header) => {
      this.received(body, header);
    });
    background(this.probe(), 'lan_push.probe_failed');
  }

  async close(): Promise<void> {
    this.stopped = true;
    this.clearTimer();
    this.options.client.onUplink(null);
    if (this.subscribedAt === null) {
      return;
    }
    const { client, virtualDid, log, did } = this.options;
    try {
      const params = subscriptionParams(virtualDid, this.subscribedAt);
      checkSubscription(UNSUBSCRIBE_METHOD, await client.call(UNSUBSCRIBE_METHOD, params));
    } catch (error) {
      log.warn('xiaomi_push.unsubscribe_failed', { did, reason: failureLine(error) });
    }
    this.subscribedAt = null;
  }

  private async probe(): Promise<void> {
    if (this.stopped) {
      return;
    }
    try {
      const reply = await this.options.client.probe(this.options.virtualDid);
      await this.answered(reply);
    } catch (error) {
      this.options.log.debug('xiaomi_push.probe_unanswered', () => ({
        did: this.options.did,
        missed: this.missed + 1,
        answeredOnce: this.answeredOnce,
        reason: failureLine(error),
      }));
      this.unanswered(error);
    }
  }

  private async answered(reply: ProbeReply): Promise<void> {
    const { did, host } = this.options;
    if (String(reply.deviceId) !== did) {
      this.lose(`a different device (${String(reply.deviceId)}) now answers at ${host}`);
      return;
    }
    this.missed = 0;
    this.answeredOnce = true;
    if (this.current.kind === 'lost') {
      this.interval = this.options.timing.keepAliveMinMs;
      this.setState({ kind: 'probing' });
      this.listener.returned();
    }
    if (reply.offer === null) {
      this.setState({
        kind: 'unsupported',
        reason: `the device at ${host} answered the push probe without offering a subscription`,
      });
      return;
    }
    await this.offered(reply.offer);
  }

  private async offered(offer: PushOffer): Promise<void> {
    if (!offer.wildcard) {
      this.setState({
        kind: 'unsupported',
        reason: 'the device offers push per property only, not the wildcard subscription',
      });
      return;
    }
    if (needsSubscription(offer, this.subscribedAt)) {
      await this.subscribe();
    }
    this.scheduleKeepAlive();
  }

  private async subscribe(): Promise<void> {
    const { client, virtualDid, now, did, log } = this.options;
    const at = Math.floor(now() / MILLISECONDS_PER_SECOND);
    try {
      const result = await client.call(SUBSCRIBE_METHOD, subscriptionParams(virtualDid, at));
      checkSubscription(SUBSCRIBE_METHOD, result);
    } catch (error) {
      if (error instanceof MiioTimeoutError) {
        throw error;
      }
      this.setState({
        kind: 'unsupported',
        reason: `the device refused ${SUBSCRIBE_METHOD}: ${failureLine(error)}`,
      });
      return;
    }
    this.subscribedAt = at;
    this.setState({ kind: 'subscribed', since: now() });
    log.info('xiaomi_push.subscribed', { did });
    this.listener.subscribed();
  }

  private unanswered(error: unknown): void {
    const { timing, host } = this.options;
    this.missed += 1;
    if (this.current.kind === 'lost') {
      this.schedule(timing.keepAliveMaxMs);
      return;
    }
    if (this.missed <= timing.fastPings) {
      this.schedule(timing.fastPingMs);
      return;
    }
    if (!this.answeredOnce) {
      this.setState({
        kind: 'unsupported',
        reason: `the device at ${host} did not answer the push probe: ${failureLine(error)}`,
      });
      return;
    }
    this.lose(`the device stopped answering keep-alive probes at ${host}: ${failureLine(error)}`);
  }

  private lose(reason: string): void {
    this.subscribedAt = null;
    this.interval = this.options.timing.keepAliveMinMs;
    this.setState({ kind: 'lost', reason });
    this.options.log.warn('xiaomi_push.lost', { did: this.options.did, reason });
    this.listener.lost(reason);
    this.schedule(this.options.timing.keepAliveMaxMs);
  }

  private received(body: string, header: MiioHeader): void {
    const { did, client, log, now, timing } = this.options;
    if (this.stopped || String(header.deviceId) !== did) {
      return;
    }
    const noticeId = statusNoticeId(body);
    if (noticeId !== null) {
      client.answer(header, uplinkAck(noticeId));
      log.debug('xiaomi_push.status_notice', { did });
      return;
    }
    let uplink: Uplink;
    try {
      uplink = parseUplink(did, body);
    } catch (error) {
      this.repeat.warn('xiaomi_push.uplink_refused', did, {
        did,
        host: this.options.host,
        bodyLength: body.length,
        reason: failureLine(error),
      });
      return;
    }
    client.answer(header, uplinkAck(uplink.id));
    const deliver = this.delivery(uplink);
    if (deliver === null) {
      log.debug('xiaomi_push.child_unknown', { did, reason: 'no known device matches this child' });
      return;
    }
    const key = JSON.stringify([
      did,
      uplink.kind === 'child-event' ? uplink.childDid : did,
      uplink.id,
    ]);
    const at = now();
    if ((this.seen.get(key) ?? 0) > at) {
      this.duplicates += 1;
      this.repeat.debug('xiaomi_push.uplink_duplicate', did, { did, duplicates: this.duplicates });
      return;
    }
    this.remember(key, at + timing.duplicateWindowMs, at);
    deliver();
    if (this.current.kind === 'subscribed') {
      this.missed = 0;
      this.scheduleKeepAlive();
    }
  }

  private delivery(uplink: Uplink): (() => void) | null {
    return uplink.kind === 'child-event'
      ? (this.listener.childUplink?.(uplink) ?? null)
      : (): void => {
          this.listener.uplink(uplink);
        };
  }

  private remember(id: string, until: number, at: number): void {
    for (const [known, expires] of this.seen) {
      if (expires <= at || this.seen.size >= SEEN_LIMIT) {
        this.seen.delete(known);
      }
    }
    this.seen.set(id, until);
  }

  private scheduleKeepAlive(): void {
    const { keepAliveMaxMs } = this.options.timing;
    this.interval = Math.min(this.interval * 2, keepAliveMaxMs);
    const spread = 1 + (this.options.jitter() - 0.5) * JITTER_SPAN;
    this.schedule(Math.round(this.interval * spread));
  }

  private schedule(delayMs: number): void {
    this.clearTimer();
    if (this.stopped) {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      background(this.probe(), 'lan_push.probe_failed');
    }, delayMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private setState(state: PushState): void {
    this.options.log.info('xiaomi_push.state_changed', {
      did: this.options.did,
      host: this.options.host,
      from: this.current.kind,
      to: state.kind,
      reason: 'reason' in state ? state.reason : undefined,
    });
    this.current = state;
    this.listener.changed(state);
  }
}
