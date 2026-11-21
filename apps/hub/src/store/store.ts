import { basename } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import { ChangeFeed } from './feed';
import { CHECKPOINT_FRAMES, StoreCheckpoints } from './checkpoints';
import { DriveSyncRetention } from './drive-sync-retention';
import { StoreReader } from './reader';
import type { DriveFolders } from '../data-layout/drive-folders';
import { StoreHost } from './host/host';
import { StoreLive } from './live';
import { DRIVE_TOTALS_QUIET_MS } from './quiet-totals';
import { DAY_MS } from '../metrics/minute';
import { background } from '@smarteverything/logging';
import type { StoreOpened } from './open-unit';
import { AGED_ROWS, RETENTION_BATCH_ROWS } from './retention';

export interface StoreOptions {
  readonly path: string;
  readonly log: Logger;
  readonly now: () => Date;
  readonly systemTimeZone: string;
  readonly driveFolders: DriveFolders | null;
  readonly host: StoreHostSetup;
}

export interface StoreHostSetup {
  readonly script: string;
  readonly readers: number;
}

export const STORE_BUSY_TIMEOUT_MS = 5000;

const FEED_SUMMARY_MS = 60_000;

const RETENTION_SWEEP_MS = DAY_MS;

export interface Store {
  readonly path: string;
  readonly feed: ChangeFeed;
  readonly reader: StoreReader;
  readonly host: StoreHost;
  readonly live: StoreLive;
  readonly now: () => Date;
  readonly startRetention: () => void;
  readonly close: () => Promise<void>;
}

function idBatches(ids: readonly string[]): string[][] {
  const batches: string[][] = [];
  for (let at = 0; at < ids.length; at += RETENTION_BATCH_ROWS)
    batches.push(ids.slice(at, at + RETENTION_BATCH_ROWS));
  return batches;
}

async function sweptAged(host: StoreHost): Promise<Record<string, number>> {
  const removed: Record<string, number> = {};
  for (const { table } of AGED_ROWS) {
    let total = 0;
    for (;;) {
      const rows = await host.write('storeRetentionAged', { table });
      total += rows;
      if (rows < RETENTION_BATCH_ROWS) break;
    }
    removed[table] = total;
  }
  return removed;
}

async function sweptAutomations(host: StoreHost): Promise<Record<string, number>> {
  const plan = await host.read('storeRetentionPlan', null);
  let commands = 0;
  let runs = 0;
  let nodes = 0;
  let plans = 0;
  for (const ids of idBatches(plan.forgetRuns)) {
    const forgotten = await host.write('storeRetentionRuns', { ids });
    commands += forgotten.commands;
    runs += forgotten.runs;
  }
  for (const ids of idBatches(plan.dropNodes))
    nodes += await host.write('storeRetentionNodes', { ids });
  for (const hashes of idBatches(plan.orphanPlans))
    plans += await host.write('storeRetentionPlans', { hashes });
  return {
    automation_runs: runs,
    automation_run_commands: commands,
    automation_run_nodes: nodes,
    automation_plans: plans,
  };
}

function retentionOf(
  host: StoreHost,
  options: StoreOptions,
): { start: () => void; stop: () => void } {
  let timer: NodeJS.Timeout | null = null;
  const sweep = async (): Promise<void> => {
    const removed = { ...(await sweptAged(host)), ...(await sweptAutomations(host)) };
    options.log.debug('store.retention_swept', removed);
    const tables = await host.read('storeAutomationStorage', null);
    options.log.debug('store.automation_storage', { tables });
  };
  const swept = (): void => {
    background(sweep(), 'store.retention_failed');
  };
  return {
    start: (): void => {
      if (timer !== null) return;
      swept();
      timer = setInterval(swept, RETENTION_SWEEP_MS);
      timer.unref();
    },
    stop: (): void => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
  };
}

function backgroundWorkOf(feed: ChangeFeed, options: StoreOptions): () => Promise<void> {
  const checkpoints = new StoreCheckpoints({
    ...options,
    busyTimeoutMs: STORE_BUSY_TIMEOUT_MS,
    frames: CHECKPOINT_FRAMES,
  });
  const retention = new DriveSyncRetention({
    path: options.path,
    busyTimeoutMs: STORE_BUSY_TIMEOUT_MS,
    now: options.now,
    log: options.log,
  });
  const stop = feed.subscribeCommitted(() => {
    checkpoints.trigger();
    retention.observe();
  });
  return async (): Promise<void> => {
    stop();
    await Promise.all([retention.close(), checkpoints.close()]);
  };
}

function hostOf(feed: ChangeFeed, options: StoreOptions): StoreHost {
  return new StoreHost({
    script: options.host.script,
    readers: options.host.readers,
    path: options.path,
    driveFolders: options.driveFolders,
    busyTimeoutMs: STORE_BUSY_TIMEOUT_MS,
    log: options.log,
    now: options.now,
    feed,
    committed: (): void => {
      feed.committed();
    },
  });
}

function summaryOf(feed: ChangeFeed, log: Logger): NodeJS.Timeout {
  const timer = setInterval(() => {
    log.debug('change.summary', () => ({ ...feed.drain(), windowMs: FEED_SUMMARY_MS }));
  }, FEED_SUMMARY_MS);
  timer.unref();
  return timer;
}

async function opened(host: StoreHost, options: StoreOptions): Promise<StoreOpened> {
  try {
    return await host.write('storeOpen', { systemTimeZone: options.systemTimeZone });
  } catch (cause) {
    await host.close();
    throw cause;
  }
}

function openedLog(options: StoreOptions, version: number, startedAt: number): void {
  options.log.info('store.opened', { version });
  options.log.debug('store.open_timed', () => ({
    file: basename(options.path),
    durationMs: Math.round(performance.now() - startedAt),
  }));
}

async function loadedLive(host: StoreHost, feed: ChangeFeed, now: () => Date): Promise<StoreLive> {
  const live = new StoreLive(host, feed, now);
  await Promise.all([live.home.load(), live.access.load(), live.usage.load(), live.chats.load()]);
  return live;
}

export async function openStore(options: StoreOptions): Promise<Store> {
  options.log.debug('store.opening', () => ({ file: basename(options.path) }));
  const startedAt = performance.now();
  const feed = new ChangeFeed(options.log);
  feed.quietTotals(DRIVE_TOTALS_QUIET_MS);
  const host = hostOf(feed, options);
  const { version } = await opened(host, options);
  const feedSummary = summaryOf(feed, options.log);
  const retention = retentionOf(host, options);
  const reader = new StoreReader({ ...options, busyTimeoutMs: STORE_BUSY_TIMEOUT_MS });
  const stopBackground = backgroundWorkOf(feed, options);
  openedLog(options, version, startedAt);
  const live = await loadedLive(host, feed, options.now);
  return {
    path: options.path,
    feed,
    reader,
    host,
    live,
    now: options.now,
    startRetention: retention.start,
    close: async (): Promise<void> => {
      clearInterval(feedSummary);
      feed.settleTotals();
      retention.stop();
      await Promise.all([stopBackground(), reader.close(), host.close()]);
      options.log.info('store.closed', { file: basename(options.path) });
    },
  };
}
