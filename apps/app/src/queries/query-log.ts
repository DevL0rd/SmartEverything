import type { QueryCache, QueryClient } from '@tanstack/react-query';
import { Logger } from '@smarteverything/logging';
import { LogTally, errorFields, hashText } from '../design/log-tally';

const log = new Logger('app.queries');

const SUMMARY_MS = 10_000;

function rootOf(key: readonly unknown[]): string {
  const first = key[0];
  return typeof first === 'string' ? first : typeof first;
}

function counts(cache: QueryCache): { queries: number; fetching: number; observers: number } {
  let fetching = 0;
  let observers = 0;
  const all = cache.getAll();
  for (const query of all) {
    if (query.state.fetchStatus === 'fetching') fetching += 1;
    observers += query.getObserversCount();
  }
  return { queries: all.length, fetching, observers };
}

interface Probe {
  readonly queryKey: readonly unknown[];
  readonly queryHash: string;
  readonly state: { readonly fetchFailureCount: number; readonly fetchStatus: string };
  readonly getObserversCount: () => number;
}

function idsOf(query: Probe): { root: string; hash: string } {
  return { root: rootOf(query.queryKey), hash: hashText(query.queryHash) };
}

class FetchLog {
  private readonly started = new Map<string, number>();
  private readonly tally: LogTally;

  constructor(cache: QueryCache) {
    this.tally = new LogTally(log, 'cache.summarised', SUMMARY_MS, () => counts(cache));
  }

  count(key: string): void {
    this.tally.bump(key);
  }

  begin(query: Probe): void {
    this.started.set(query.queryHash, Date.now());
    this.tally.bump('fetchStarted');
    log.debug('fetch.started', () => ({
      ...idsOf(query),
      observers: query.getObserversCount(),
    }));
  }

  retry(query: Probe, failureCount: number, error: unknown): void {
    log.debug('fetch.retried', () => ({ ...idsOf(query), failureCount, ...errorFields(error) }));
  }

  end(query: Probe, error: unknown): void {
    const begun = this.started.get(query.queryHash);
    this.started.delete(query.queryHash);
    const durationMs = begun === undefined ? null : Date.now() - begun;
    if (error === null) {
      this.tally.bump('fetchSucceeded');
      log.debug('fetch.succeeded', () => ({ ...idsOf(query), durationMs }));
      return;
    }
    this.tally.bump('fetchFailed');
    log.warn('fetch.failed', {
      ...idsOf(query),
      durationMs,
      failureCount: query.state.fetchFailureCount,
      ...errorFields(error),
    });
  }
}

export function watchQueryCache(client: QueryClient): () => void {
  const cache = client.getQueryCache();
  const fetches = new FetchLog(cache);
  return cache.subscribe((event) => {
    try {
      if (event.type === 'added' || event.type === 'removed') fetches.count(event.type);
      if (event.type !== 'updated') return;
      const action = event.action;
      if (action.type === 'fetch') fetches.begin(event.query);
      else if (action.type === 'failed')
        fetches.retry(event.query, action.failureCount, action.error);
      else if (action.type === 'success') fetches.end(event.query, null);
      else if (action.type === 'error') fetches.end(event.query, action.error);
    } catch (error) {
      log.warn('cache.log_failed', errorFields(error));
    }
  });
}
