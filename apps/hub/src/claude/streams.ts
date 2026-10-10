import { randomUUID } from 'node:crypto';
import type { ClaudeUsage } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import { ClaudeControlFailedError, ClaudeControlTimeoutError } from './errors';
import type { ModAction, ModReport } from './hook-events';
import { NO_USAGE } from './plan-usage';

const REQUEST_TIMEOUT_MS = 10_000;

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
  readonly settle: (error: string | null) => void;
}

const WINDOW_BY_KIND: Readonly<Record<string, ClaudeUsage['windows'][number]['window']>> = {
  five_hour: 'five_hour',
  seven_day: 'seven_day',
};

export class ModStreams {
  private readonly open = new Map<string, StreamSink>();
  private readonly pending = new Map<string, Pending>();
  private latest: ClaudeUsage = NO_USAGE;

  constructor(private readonly options: StreamOptions) {}

  has(sessionId: string): boolean {
    return this.open.has(sessionId);
  }

  usage(): ClaudeUsage {
    return this.latest;
  }

  attach(sessionId: string, sink: StreamSink, closed: AbortSignal): void {
    this.open.get(sessionId)?.close();
    this.open.set(sessionId, sink);
    this.options.log.info('stream.attached', { session: sessionId });
    this.options.changed();
    closed.addEventListener(
      'abort',
      () => {
        if (this.open.get(sessionId) === sink) {
          this.open.delete(sessionId);
          this.options.log.info('stream.detached', { session: sessionId });
          this.failPending(sessionId, 'the session closed its link');
          this.options.changed();
        }
      },
      { once: true },
    );
  }

  request(sessionId: string, action: ModAction): Promise<void> {
    const sink = this.open.get(sessionId);
    if (sink === undefined) {
      return Promise.reject(
        new ClaudeControlFailedError(action.op, 'session link', 'the session is not connected'),
      );
    }
    const id = randomUUID();
    const timeoutMs = this.options.timeoutMs ?? REQUEST_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      const cancel = this.options.clock.at(
        new Date(this.options.clock.now().getTime() + timeoutMs),
        () => {
          this.pending.delete(id);
          reject(new ClaudeControlTimeoutError(action.op, 'session link', timeoutMs / 1000));
        },
      );
      this.pending.set(id, {
        action: action.op,
        sessionId,
        settle: (error) => {
          cancel();
          if (error === null) {
            resolve();
          } else {
            reject(new ClaudeControlFailedError(action.op, 'session link', error));
          }
        },
      });
      sink.write(`${JSON.stringify({ ...action, id })}\n`);
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
    waiting.settle(report.ok ? null : (report.error ?? 'the session refused it'));
  }

  private failPending(sessionId: string, reason: string): void {
    for (const [id, waiting] of this.pending) {
      if (waiting.sessionId === sessionId) {
        this.pending.delete(id);
        waiting.settle(reason);
      }
    }
  }
}
