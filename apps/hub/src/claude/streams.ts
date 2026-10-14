import { randomUUID } from 'node:crypto';
import type { ClaudeUsage, JsonValue } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import {
  ClaudeControlFailedError,
  ClaudeControlTimeoutError,
  ClaudeControlUncertainError,
} from './errors';
import type { ModAction, ModReport } from './hook-events';
import { NO_USAGE } from './plan-usage';

const REQUEST_TIMEOUT_MS = 10_000;
const MUTATION_TIMEOUT_MS = 3_600_000;

export interface StreamSink {
  readonly write: (line: string) => void;
  readonly close: () => void;
}

export interface StreamOptions {
  readonly clock: Clock;
  readonly log: Logger;
  readonly timeoutMs?: number;
  readonly changed: () => void;
}

interface Pending {
  readonly action: string;
  readonly sessionId: string;
  readonly settle: (error: string | Error | null, value: JsonValue) => void;
}

const WINDOW_BY_KIND: Readonly<Record<string, ClaudeUsage['windows'][number]['window']>> = {
  five_hour: 'five_hour',
  seven_day: 'seven_day',
};

export class ModStreams {
  private readonly open = new Map<string, StreamSink>();
  private readonly pending = new Map<string, Pending>();
  private readonly single = new Set<StreamSink>();
  private readonly recent = new Map<string, number>();
  private readonly queued = new Map<string, { session: string; line: string }>();
  private latest: ClaudeUsage = NO_USAGE;

  constructor(private readonly options: StreamOptions) {}

  has(sessionId: string): boolean {
    return (
      this.open.has(sessionId) ||
      (this.recent.get(sessionId) ?? 0) > this.options.clock.now().getTime()
    );
  }

  sessions(): readonly string[] {
    return [...this.recent.keys()].filter((session) => this.has(session));
  }

  usage(): ClaudeUsage {
    return this.latest;
  }

  attach(sessionId: string, sink: StreamSink, closed: AbortSignal, single = false): void {
    this.open.get(sessionId)?.close();
    this.open.set(sessionId, sink);
    if (single) this.single.add(sink);
    this.recent.set(sessionId, this.options.clock.now().getTime() + 35_000);
    for (const [id, queued] of this.queued) {
      if (queued.session === sessionId) {
        this.queued.delete(id);
        this.deliver(sessionId, sink, queued.line);
        break;
      }
    }
    this.options.log.info('stream.attached', { session: sessionId });
    this.options.changed();
    closed.addEventListener(
      'abort',
      () => {
        this.single.delete(sink);
        if (this.open.get(sessionId) === sink) {
          this.open.delete(sessionId);
          this.options.log.info('stream.detached', { session: sessionId });
          this.options.changed();
        }
      },
      { once: true },
    );
  }

  request(sessionId: string, action: ModAction): Promise<JsonValue> {
    const sink = this.open.get(sessionId);
    if (sink === undefined && !this.has(sessionId)) {
      return Promise.reject(
        new ClaudeControlFailedError(action.op, 'session link', 'the session is not connected'),
      );
    }
    const id = randomUUID();
    const timeoutMs =
      this.options.timeoutMs ??
      (action.op === 'tools' || action.op === 'usage' ? REQUEST_TIMEOUT_MS : MUTATION_TIMEOUT_MS);
    return new Promise((resolve, reject) => {
      const cancel = this.options.clock.at(
        new Date(this.options.clock.now().getTime() + timeoutMs),
        () => {
          this.pending.delete(id);
          this.queued.delete(id);
          reject(new ClaudeControlTimeoutError(action.op, 'session link', timeoutMs / 1000));
        },
      );
      this.pending.set(id, {
        action: action.op,
        sessionId,
        settle: (error, value) => {
          cancel();
          if (error === null) {
            resolve(value);
          } else {
            reject(
              error instanceof Error
                ? error
                : new ClaudeControlFailedError(action.op, 'session link', error),
            );
          }
        },
      });
      const line = `${JSON.stringify({ ...action, id })}\n`;
      if (sink === undefined) this.queued.set(id, { session: sessionId, line });
      else this.deliver(sessionId, sink, line);
    });
  }

  report(report: ModReport): void {
    if (report.kind === 'usage') {
      this.latest = {
        sampled_at: this.options.clock.now().toISOString(),
        windows: report.windows.map((entry) => ({
          key: entry.key,
          window: WINDOW_BY_KIND[entry.key] ?? 'unknown',
          used_percent: entry.used_percent,
        })),
      };
      this.options.changed();
      return;
    }
    const waiting = this.pending.get(report.request_id);
    if (waiting?.sessionId !== report.session_id) {
      this.options.log.warn('request.unmatched', {
        session: report.session_id,
        ok: report.ok,
      });
      return;
    }
    this.pending.delete(report.request_id);
    this.queued.delete(report.request_id);
    waiting.settle(
      report.ok ? null : (report.error ?? 'the session refused it'),
      report.value ?? null,
    );
  }

  private deliver(sessionId: string, sink: StreamSink, line: string): void {
    if (this.single.has(sink)) this.open.delete(sessionId);
    sink.write(line);
  }

  private failPending(sessionId: string, reason: string): void {
    for (const [id, waiting] of this.pending) {
      if (waiting.sessionId === sessionId) {
        const notSubmitted = this.queued.has(id);
        this.pending.delete(id);
        this.queued.delete(id);
        const harmless = waiting.action === 'tools' || waiting.action === 'usage';
        waiting.settle(
          notSubmitted || harmless
            ? reason
            : new ClaudeControlUncertainError(waiting.action, reason),
          null,
        );
      }
    }
  }

  stop(): void {
    for (const [sessionId, sink] of this.open) {
      sink.close();
      this.failPending(sessionId, 'the computer runtime stopped');
    }
    for (const session of this.recent.keys())
      this.failPending(session, 'the computer runtime stopped');
    this.single.clear();
    this.open.clear();
    this.recent.clear();
    this.queued.clear();
  }
}
