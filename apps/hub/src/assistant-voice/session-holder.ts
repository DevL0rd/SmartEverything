import type { UsageMetadata } from '@google/genai';
import { Logger, messageOf } from '@smarteverything/logging';
import type { LiveEvents, LiveOptions, LiveSession, VoiceProvider } from './gemini';
import { connectWithin } from './live-connect';
import type { VoiceLine } from './voice-line';
import { answers, leasedSession, routedEvents, WarmTenant } from './warm-wire';
import {
  changedParts,
  partsOf,
  refusedFor,
  retryDelayMs,
  WarmConnectClosedError,
  WarmSupersededError,
  type WarmParts,
} from './warm-policy';

const log = new Logger('hub.voice-warm');
const STABLE_MS = 30_000;
const PROBE_MS = 1000;
const IDLE_TOOL_ANSWER = { error: 'No conversation is running right now.' };
const IDLE_TOOL_DELIVERY = { scheduling: 'silent', more: false } as const;

export interface HolderDeps {
  readonly provider: VoiceProvider;
  readonly key: string;
  readonly now: () => number;
  readonly random: () => number;
}

interface Held {
  readonly id: number;
  readonly session: LiveSession;
  readonly parts: WarmParts;
  readonly startedAt: number;
  readonly connectedAt: number;
}

interface Opened {
  readonly held: Held;
  readonly resumed: boolean;
}

interface Pending {
  readonly id: number;
  readonly reject: (cause: Error) => void;
}

export class SessionHolder {
  private wire: Held | null = null;
  private pending: Pending | null = null;
  private serial = 0;
  private handle: { readonly value: string; readonly model: string } | null = null;
  private context: ReadonlySet<string> | null = null;
  private tenant: WarmTenant | null = null;
  private base: (() => LiveOptions) | null = null;
  private usage: ((usage: UsageMetadata) => void) | null = null;
  private connecting: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private attempt = 0;
  private stopped = false;
  private createdAt = 0;
  private idleSince = 0;
  private previous: WarmParts | null = null;

  constructor(private readonly deps: HolderDeps) {}

  get leased(): boolean {
    return this.tenant !== null;
  }

  lease(callId: string, base: () => LiveOptions): VoiceLine | null {
    if (this.stopped) {
      return null;
    }
    if (this.tenant !== null) {
      log.info('voice.warm_busy', { key: this.deps.key, callId });
      return null;
    }
    const tenant = new WarmTenant(callId);
    this.tenant = tenant;
    this.base = base;
    return {
      live: (options, events) => this.live(tenant, options, events),
      known: () => (this.tenant === tenant ? this.context : null),
      release: (_session, lines): void => {
        this.release(tenant, lines);
      },
    };
  }

  stop(reason: string): void {
    this.stopped = true;
    this.cancelRetry();
    this.pending = null;
    this.closeWire();
    log.info('voice.warm_stopped', { key: this.deps.key, reason });
  }

  private async live(
    tenant: WarmTenant,
    options: LiveOptions,
    events: LiveEvents,
  ): Promise<LiveSession> {
    if (this.tenant !== tenant) {
      return this.deps.provider.live(options, events);
    }
    tenant.attach(events);
    this.usage = events.usage;
    const held = tenant.started ? await this.renew(options) : await this.begin(tenant, options);
    tenant.start();
    return this.wrapped(tenant, held);
  }

  private async begin(tenant: WarmTenant, options: LiveOptions): Promise<Held> {
    this.cancelRetry();
    await this.connecting;
    const wire = await this.proven();
    const changed = wire === null ? [] : changedParts(wire.parts, partsOf(options));
    if (wire !== null && changed.length === 0) {
      this.reused(tenant, wire);
      return wire;
    }
    if (wire !== null) {
      log.info('voice.warm_stale', { key: this.deps.key, callId: tenant.callId, changed });
      this.closeWire();
    }
    const opened = await this.open(options);
    if (!opened.resumed) {
      this.created(opened.held);
    }
    return opened.held;
  }

  private async proven(): Promise<Held | null> {
    const wire = this.wire;
    if (wire === null || (await answers(wire.session, PROBE_MS))) {
      return this.wire;
    }
    this.lazy('unproven');
    return null;
  }

  private reused(tenant: WarmTenant, wire: Held): void {
    const now = this.deps.now();
    log.info('voice.warm_reused', {
      key: this.deps.key,
      callId: tenant.callId,
      ageMs: now - this.createdAt,
      idleMs: now - this.idleSince,
      sinceConnectMs: now - wire.connectedAt,
    });
    if (this.handle !== null) {
      tenant.sink?.resumable(this.handle.value);
    }
  }

  private created(held: Held): void {
    this.createdAt = held.connectedAt;
    log.info('voice.warm_created', {
      key: this.deps.key,
      durationMs: held.connectedAt - held.startedAt,
    });
  }

  private renew(options: LiveOptions): Promise<Held> {
    this.closeWire();
    return this.connect(options);
  }

  private async open(options: LiveOptions): Promise<Opened> {
    const resume = this.handle?.model === options.model ? this.handle.value : null;
    if (resume !== null) {
      try {
        return { held: await this.connect({ ...options, resume }), resumed: true };
      } catch (cause) {
        if (cause instanceof WarmSupersededError || refusedFor(cause) !== null) {
          throw cause;
        }
        log.warn('voice.warm_handle_rejected', { key: this.deps.key, cause: messageOf(cause) });
      }
    }
    this.handle = null;
    return { held: await this.connect({ ...options, resume: null }), resumed: false };
  }

  private connect(options: LiveOptions): Promise<Held> {
    this.serial += 1;
    const id = this.serial;
    const startedAt = this.deps.now();
    return new Promise<Held>((resolve, reject) => {
      this.pending = { id, reject };
      connectWithin(this.deps.provider.live(options, this.dispatch(id, options.model))).then(
        (session) => {
          if (this.pending?.id !== id || this.stopped) {
            session.close();
            reject(new WarmSupersededError());
            return;
          }
          this.pending = null;
          const held = {
            id,
            session,
            parts: partsOf(options),
            startedAt,
            connectedAt: this.deps.now(),
          };
          this.wire = held;
          this.context = options.resume === null ? null : this.context;
          resolve(held);
        },
        (cause: unknown) => {
          if (this.pending?.id === id) {
            this.pending = null;
          }
          reject(cause instanceof Error ? cause : new Error(messageOf(cause)));
        },
      );
    });
  }

  private dispatch(id: number, model: string): LiveEvents {
    return routedEvents({
      current: () => this.wire?.id === id || this.pending?.id === id,
      sink: () => this.tenant?.sink ?? null,
      idleOutput: (kind): void => {
        log.warn('voice.warm_idle_output', { key: this.deps.key, kind });
      },
      idleTool: (callId, name): void => {
        log.warn('voice.warm_idle_output', { key: this.deps.key, kind: 'tool' });
        this.wire?.session.toolResult(callId, name, IDLE_TOOL_ANSWER, IDLE_TOOL_DELIVERY);
      },
      resumable: (handle): void => {
        this.handle = handle === null ? this.handle : { value: handle, model };
        this.tenant?.sink?.resumable(handle);
      },
      goAway: (timeLeft): void => {
        this.goAway(timeLeft);
      },
      usage: (usage): void => {
        this.usage?.(usage);
      },
      closed: (reason, code): void => {
        this.closed(id, reason, code);
      },
    });
  }

  private goAway(timeLeft: string | null): void {
    const sink = this.tenant?.sink ?? null;
    if (sink !== null) {
      sink.goAway?.(timeLeft);
      return;
    }
    this.dropped(true, 'go_away', 0);
  }

  private closed(id: number, reason: string, code: number): void {
    const pending = this.pending;
    if (pending?.id === id) {
      this.pending = null;
      pending.reject(new WarmConnectClosedError(reason, code));
      return;
    }
    if (this.wire?.id !== id) {
      return;
    }
    const sink = this.tenant?.sink ?? null;
    if (sink !== null) {
      sink.closed(reason, code);
      return;
    }
    this.dropped(false, reason, code);
  }

  private dropped(goAway: boolean, reason: string, code: number): void {
    const wire = this.wire;
    if (wire === null) {
      return;
    }
    const sinceConnectMs = this.deps.now() - wire.connectedAt;
    log.info('voice.warm_dropped', {
      key: this.deps.key,
      closeCode: code,
      reason,
      goAway,
      sinceConnectMs,
    });
    this.closeWire();
    const refused = goAway ? null : refusedFor(new WarmConnectClosedError(reason, code));
    if (refused !== null) {
      this.lazy(refused);
      return;
    }
    if (goAway || sinceConnectMs >= STABLE_MS) {
      this.attempt = 0;
    }
    this.reconnectSoon();
  }

  private release(tenant: WarmTenant, lines: readonly string[]): void {
    if (this.tenant !== tenant) {
      return;
    }
    this.tenant = null;
    this.context = new Set(lines);
    this.idleSince = this.deps.now();
    const normalize = this.wire !== null && this.drifted();
    log.info('voice.warm_released', { key: this.deps.key, callId: tenant.callId, normalize });
    if (this.stopped) {
      return;
    }
    if (normalize) {
      this.closeWire();
    }
    if (this.wire === null && this.connecting === null) {
      this.reconnectSoon();
    }
  }

  private drifted(): boolean {
    const wire = this.wire;
    const base = this.base;
    return wire !== null && base !== null && changedParts(wire.parts, partsOf(base())).length > 0;
  }

  private reconnectSoon(): void {
    this.cancelRetry();
    const delay = this.attempt === 0 ? 0 : retryDelayMs(this.attempt - 1, this.deps.random);
    this.attempt += 1;
    if (delay === 0) {
      this.reconnect();
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.reconnect();
    }, delay);
    this.timer.unref();
  }

  private reconnect(): void {
    const base = this.base;
    if (this.stopped || this.tenant !== null || base === null) {
      return;
    }
    const options = base();
    const changed = this.previous === null ? [] : changedParts(this.previous, partsOf(options));
    if (changed.length > 0) {
      log.info('voice.warm_stale', { key: this.deps.key, changed, refreshed: true });
    }
    const attempt = this.attempt;
    const connecting = this.open(options).then(
      (opened) => {
        this.reconnected(opened, attempt);
      },
      (cause: unknown) => {
        this.failed(cause, attempt);
      },
    );
    this.connecting = connecting.finally(() => {
      this.connecting = this.connecting === connecting ? null : this.connecting;
    });
  }

  private reconnected(opened: Opened, attempt: number): void {
    const { held, resumed } = opened;
    this.createdAt = resumed ? this.createdAt : held.connectedAt;
    log.info('voice.warm_reconnected', {
      key: this.deps.key,
      resumed,
      durationMs: held.connectedAt - held.startedAt,
      attempt,
    });
  }

  private failed(cause: unknown, attempt: number): void {
    if (cause instanceof WarmSupersededError || this.stopped) {
      return;
    }
    const refused = refusedFor(cause);
    if (refused !== null) {
      this.lazy(refused);
      return;
    }
    if (this.tenant !== null) {
      return;
    }
    const nextMs = retryDelayMs(this.attempt - 1, this.deps.random);
    log.warn('voice.warm_reconnect_failed', {
      key: this.deps.key,
      attempt,
      nextMs,
      cause: messageOf(cause),
    });
    this.reconnectSoon();
  }

  private lazy(reason: string): void {
    log.warn('voice.warm_stopped', { key: this.deps.key, reason });
    this.cancelRetry();
    this.closeWire();
    this.handle = null;
    this.context = null;
    this.attempt = 0;
  }

  private cancelRetry(): void {
    clearTimeout(this.timer ?? undefined);
    this.timer = null;
  }

  private closeWire(): void {
    const wire = this.wire;
    this.wire = null;
    if (wire !== null) {
      this.previous = wire.parts;
      wire.session.close();
    }
  }

  private wrapped(tenant: WarmTenant, held: Held): LiveSession {
    return leasedSession(
      held.session,
      () => this.tenant === tenant && this.wire?.id === held.id,
      () => {
        this.closeWire();
      },
    );
  }
}
