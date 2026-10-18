import { Logger, passesThreshold, redactText } from '@smarteverything/logging';
import type { HubRouteLease } from './active-route';

const log = new Logger('app.api');

const FLUSH_MS = 15_000;
const SAMPLES_PER_ROUTE = 200;
const SUMMARY_ROUTES = 12;
const SLOW_MS = 2000;
const TEXT_LIMIT = 160;

interface RouteTally {
  count: number;
  failures: number;
  streak: number;
  durations: number[];
}

let routes = new Map<string, RouteTally>();
let counters = new Map<string, number>();
let timer: ReturnType<typeof setInterval> | null = null;
let idleFlushes = 0;

function logsDebug(): boolean {
  return passesThreshold('debug', Logger.level);
}

export function nowMs(): number {
  return Math.round(performance.now());
}

export function pathShape(url: string): string {
  try {
    return new URL(url).pathname.split('/').slice(0, 4).join('/');
    // eslint-disable-next-line local/no-swallowed-errors -- a URL that does not parse is reported as the typed fallback 'unparsable'
  } catch {
    return 'unparsable';
  }
}

export function safeText(text: string): string {
  return redactText(text, TEXT_LIMIT);
}

export function failureFacts(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { errorName: typeof error, cause: 'not an Error' };
  const code: unknown = Reflect.get(error, 'code');
  return {
    errorName: error.name,
    ...(typeof code === 'string' || typeof code === 'number' ? { errorCode: code } : {}),
    cause: safeText(error.message),
  };
}

export function abortFacts(signal: AbortSignal | undefined | null): Record<string, unknown> {
  if (signal === undefined || signal === null) return { callerSignal: false };
  const reason: unknown = signal.aborted ? signal.reason : undefined;
  return {
    callerSignal: true,
    callerAborted: signal.aborted,
    ...(reason instanceof Error
      ? { abortReason: reason.name, abortMessage: safeText(reason.message) }
      : {}),
  };
}

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index] ?? 0;
}

function summaryOf(): void {
  if (routes.size === 0 && counters.size === 0) {
    idleFlushes += 1;
    if (idleFlushes >= 2 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    return;
  }
  idleFlushes = 0;
  const lines = [...routes.entries()]
    .sort((left, right) => right[1].count - left[1].count)
    .slice(0, SUMMARY_ROUTES)
    .map(([route, tally]) => {
      const sorted = [...tally.durations].sort((left, right) => left - right);
      return `${route} n=${String(tally.count)} fail=${String(tally.failures)} p50=${String(percentile(sorted, 0.5))}ms p95=${String(percentile(sorted, 0.95))}ms max=${String(sorted.at(-1) ?? 0)}ms`;
    });
  const counts = Object.fromEntries(counters);
  const total = [...routes.values()].reduce((sum, tally) => sum + tally.count, 0);
  const failed = [...routes.values()].reduce((sum, tally) => sum + tally.failures, 0);
  routes = new Map();
  counters = new Map();
  log.debug('api.summary', {
    windowMs: FLUSH_MS,
    requests: total,
    failures: failed,
    routes: lines,
    counters: counts,
  });
}

function ensureTimer(): void {
  timer ??= setInterval(summaryOf, FLUSH_MS);
}

export function countEvent(name: string): void {
  if (!logsDebug()) return;
  ensureTimer();
  counters.set(name, (counters.get(name) ?? 0) + 1);
}

function tallyRequest(route: string, ms: number, failed: boolean): number {
  if (!logsDebug()) return 0;
  ensureTimer();
  let tally = routes.get(route);
  if (tally === undefined) {
    tally = { count: 0, failures: 0, streak: 0, durations: [] };
    routes.set(route, tally);
  }
  tally.count += 1;
  if (failed) {
    tally.failures += 1;
    tally.streak += 1;
  } else tally.streak = 0;
  if (tally.durations.length < SAMPLES_PER_ROUTE) tally.durations.push(ms);
  return tally.streak;
}

export interface RequestOutcome {
  readonly route: string;
  readonly method: string;
  readonly routeKind: string;
  readonly generation: number | null;
  readonly scopeId: string | null;
  readonly status: number | null;
  readonly elapsedMs: number;
  readonly waitedMs: number;
  readonly error?: unknown;
  readonly signal?: AbortSignal | undefined;
}

function callerCancelled(outcome: RequestOutcome): boolean {
  return outcome.signal?.aborted === true;
}

export class RequestTrace {
  private readonly startedAt = nowMs();
  waitedMs = 0;
  status: number | null = null;
  lease: HubRouteLease | undefined;

  constructor(
    private readonly route: string | null,
    private readonly method: string,
    private readonly signal: AbortSignal | undefined,
  ) {}

  ready(): void {
    this.waitedMs = nowMs() - this.startedAt;
  }

  finish(error?: unknown): void {
    if (this.route === null) return;
    noteRequest({
      route: this.route,
      method: this.method,
      routeKind: this.lease?.endpoint.kind ?? 'direct',
      generation: this.lease?.generation ?? null,
      scopeId: this.lease?.scopeId ?? null,
      status: this.status,
      elapsedMs: nowMs() - this.startedAt,
      waitedMs: this.waitedMs,
      ...(error === undefined ? {} : { error }),
      signal: this.signal,
    });
  }
}

export function noteSendFailure(
  method: string,
  lease: HubRouteLease | undefined,
  signal: AbortSignal | undefined,
  error: unknown,
): void {
  log.debug('api.send_failed', () => ({
    method,
    routeKind: lease?.endpoint.kind ?? 'direct',
    ...abortFacts(signal),
    ...failureFacts(error),
  }));
}

export function noteRequest(outcome: RequestOutcome): void {
  const failed = outcome.error !== undefined;
  const streak = tallyRequest(
    outcome.route,
    outcome.elapsedMs,
    failed && !callerCancelled(outcome),
  );
  const base = {
    route: outcome.route,
    routeKind: outcome.routeKind,
    generation: outcome.generation,
    scopeId: outcome.scopeId === null ? null : outcome.scopeId.slice(0, 8),
    status: outcome.status,
    elapsedMs: outcome.elapsedMs,
    waitedMs: outcome.waitedMs,
    attempt: Math.max(1, streak),
  };
  if (!failed) {
    if (outcome.elapsedMs >= SLOW_MS) log.info('api.request_slow', base);
    else log.trace('api.request_done', base);
    return;
  }
  if (callerCancelled(outcome)) {
    log.debug('api.request_cancelled', () => ({
      ...base,
      ...abortFacts(outcome.signal),
      ...failureFacts(outcome.error),
    }));
    return;
  }
  log.warn('api.request_failed', { ...base, ...failureFacts(outcome.error) });
}
