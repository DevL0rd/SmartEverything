import { background, type Logger } from '@smarteverything/logging';
import type { LogLevel } from '@smarteverything/logging';
import type { Clock } from '../../../clock';
import type { ChildHost } from '../../../plugins/isolation/child-host';
import { Backoff } from '../../../plugins/backoff';
import { ChildUnavailableError, READY_EVENT } from '../../../plugins/isolation/frames';
import type { EarPipelineFactory } from '../ear-pipeline';
import { EarProcessPort, type PortCallbacks } from './process-port';
import { remoteEarPipeline } from './process-pipeline';
import { EarProcessEvents, type EarProcessSinks } from './process-events';
import type { EAR_COMMAND } from './protocol';
import { EAR_CALL } from './protocol';

const INIT_MS = 60_000;
const PING_EVERY_MS = 5000;
const PING_TIMEOUT_MS = 15_000;

type EarCommand = (typeof EAR_COMMAND)[keyof typeof EAR_COMMAND];
type EarCall = (typeof EAR_CALL)[keyof typeof EAR_CALL];

export interface EarSession {
  readonly replay: () => Promise<void>;
  readonly crashed: () => void;
}

export interface EarProcessOptions {
  readonly host: ChildHost;
  readonly wakeDiagnosticsDirectory: string | null;
  readonly logPath: string;
  readonly release: string;
  readonly level: LogLevel;
  readonly clock: Pick<Clock, 'now'>;
  readonly log: Logger;
}

export class EarProcess {
  readonly events: EarProcessEvents;
  private readonly sessions = new Set<EarSession>();
  private readonly backoff = new Backoff();
  private starting: Promise<void> | null = null;
  private running = false;
  private pinging = false;
  private unansweredSince: number | null = null;
  private pinger: NodeJS.Timeout | null = null;
  private recycling: NodeJS.Timeout | null = null;
  private lastPort = 0;
  private lastLocal = 0;
  private stopped = false;

  constructor(private readonly options: EarProcessOptions) {
    this.events = new EarProcessEvents(options.log, (reason) => {
      options.log.warn('ear_process.lost', { reason });
    });
    options.host.hold();
    options.host.onEvent((name, payload) => {
      if (name === READY_EVENT) {
        background(this.load(), 'ear_process.start_failed');
      } else {
        this.events.received(name, payload);
      }
    });
    options.host.onCrash(() => {
      this.lose();
    });
  }

  get ready(): boolean {
    return this.running;
  }

  private get alive(): boolean {
    return this.running;
  }

  get sinks(): EarProcessSinks {
    return this.events.sinks;
  }

  load(): Promise<void> {
    this.starting ??= this.initialise().catch((cause: unknown) => {
      this.starting = null;
      throw cause;
    });
    return this.starting;
  }

  hostPort(callbacks: PortCallbacks): EarProcessPort {
    this.lastPort += 1;
    return new EarProcessPort(this, this.lastPort, callbacks);
  }

  readonly pipeline: EarPipelineFactory = (config, handlers) =>
    remoteEarPipeline(this, config, handlers);

  nextLocal(): number {
    this.lastLocal += 1;
    return this.lastLocal;
  }

  track(session: EarSession): void {
    this.sessions.add(session);
  }

  attach(session: EarSession): void {
    this.track(session);
    if (this.running) {
      this.replay(session);
    } else if (this.starting === null) {
      background(this.load(), 'ear_process.start_failed');
    }
  }

  detach(session: EarSession): void {
    this.sessions.delete(session);
  }

  command(name: EarCommand, payload: unknown): void {
    if (this.running) {
      this.options.host.send(name, payload);
    }
  }

  call(name: EarCall, payload: unknown): Promise<unknown> {
    return this.options.host.call(name, payload, INIT_MS);
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    this.running = false;
    this.options.host.retire();
  }

  private async initialise(): Promise<void> {
    await this.options.host.call(
      EAR_CALL.init,
      {
        wakeDiagnosticsDirectory: this.options.wakeDiagnosticsDirectory,
        logPath: this.options.logPath,
        level: this.options.level,
        release: this.options.release,
      },
      INIT_MS,
    );
    this.running = true;
    this.startPinging();
    this.options.log.info('ear_process.started', { sessions: this.sessions.size });
    this.sessions.forEach((session) => {
      this.replay(session);
    });
  }

  private replay(session: EarSession): void {
    session.replay().catch((cause: unknown) => {
      this.options.log.error('ear_process.replay_failed', cause);
    });
  }

  private lose(): void {
    this.running = false;
    this.unansweredSince = null;
    this.starting = null;
    this.clearTimers();
    this.sessions.forEach((session) => {
      session.crashed();
    });
  }

  private startPinging(): void {
    this.clearPinger();
    this.pinger = setInterval(() => {
      background(this.ping(), 'ear_process.ping_failed');
    }, PING_EVERY_MS);
    this.pinger.unref();
  }

  private async ping(): Promise<void> {
    if (this.pinging || !this.running) {
      return;
    }
    this.pinging = true;
    const startedAt = performance.now();
    try {
      await this.options.host.call(EAR_CALL.ping, null, PING_TIMEOUT_MS);
      this.unansweredSince = null;
    } catch (cause) {
      this.unanswered(cause, startedAt);
    } finally {
      this.pinging = false;
    }
  }

  private unanswered(cause: unknown, startedAt: number): void {
    if (!(cause instanceof ChildUnavailableError) || !this.alive) {
      return;
    }
    this.unansweredSince ??= startedAt;
    if (performance.now() - this.unansweredSince >= PING_TIMEOUT_MS) {
      this.recycle(cause);
    }
  }

  private recycle(cause: Error): void {
    const delayMs = this.backoff.nextDelay(this.options.clock.now().getTime());
    this.options.log.error('ear_process.unresponsive', cause, {
      timeoutMs: PING_TIMEOUT_MS,
      restartInMs: delayMs,
      consequence: 'the ear process is killed and started again; its audio backlog is dropped',
    });
    this.options.host.retire();
    this.lose();
    this.recycling = setTimeout(() => {
      this.recycling = null;
      if (!this.stopped) {
        background(this.load(), 'ear_process.start_failed');
      }
    }, delayMs);
    this.recycling.unref();
  }

  private clearPinger(): void {
    if (this.pinger !== null) {
      clearInterval(this.pinger);
      this.pinger = null;
    }
  }

  private clearTimers(): void {
    this.clearPinger();
    if (this.recycling !== null) {
      clearTimeout(this.recycling);
      this.recycling = null;
    }
  }
}
