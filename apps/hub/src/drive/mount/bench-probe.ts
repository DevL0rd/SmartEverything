import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { Session } from 'node:inspector';
import { join } from 'node:path';
import { env } from 'node:process';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { decodeMeta, type RequestOpName } from '@smarteverything/domain/drive-mount';
import { background } from '@smarteverything/logging';
import { z } from 'zod';
import type { Store } from '../../store/store';
import type { MountSession } from './session';

const VARIABLE = 'SMARTEVERYTHING_MOUNT_BENCH';
const PARALLEL_FLAG = 'parallel';
const SAMPLING_US = 1000;
const PROFILE = z.object({ profile: z.unknown() });
const PARENT = z.looseObject({ parent: z.number() });
const INODE = z.looseObject({ ino: z.number() });
const LINK = z.looseObject({ ino: z.number(), parent: z.number() });
const RENAME = z.looseObject({ parent: z.number(), newParent: z.number() });
const END = z.looseObject({ commit: z.number() });

interface Samples {
  readonly wait: number[];
  readonly run: number[];
}

export interface KeyedRequest {
  readonly store: Store;
  readonly session: MountSession;
  readonly name: RequestOpName;
  readonly meta: Uint8Array;
}

type KeyOf = (request: KeyedRequest) => readonly string[];

function percentile(sorted: readonly number[], quantile: number): number {
  return sorted[Math.floor(quantile * (sorted.length - 1))] ?? 0;
}

function summarize(values: number[]): object {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    totalMs: sorted.reduce((sum, value) => sum + value, 0),
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted.at(-1) ?? 0,
  };
}

function post(session: Session, method: string, params?: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    session.post(method, params, (failure, result) => {
      if (failure === null) resolve(result);
      else reject(failure);
    });
  });
}

function parent(request: KeyedRequest): readonly string[] {
  const decoded = decodeMeta(PARENT, request.meta);
  return [`d${String(decoded.parent)}`];
}

function inode(request: KeyedRequest): readonly string[] {
  const decoded = decodeMeta(INODE, request.meta);
  return [`i${String(decoded.ino)}`];
}

function link(request: KeyedRequest): readonly string[] {
  const decoded = decodeMeta(LINK, request.meta);
  return [`d${String(decoded.parent)}`, `i${String(decoded.ino)}`];
}

function rename(request: KeyedRequest): readonly string[] {
  const decoded = decodeMeta(RENAME, request.meta);
  return [`d${String(decoded.parent)}`, `d${String(decoded.newParent)}`];
}

function end(request: KeyedRequest): readonly string[] {
  const decoded = decodeMeta(END, request.meta);
  const commit = request.store.driveMountCommits.find(decoded.commit);
  return [commit === undefined ? `c${String(decoded.commit)}` : `i${String(commit.inodeId)}`];
}

const KEYS: Readonly<Partial<Record<RequestOpName, KeyOf>>> = {
  MKDIR: parent,
  CREATE: parent,
  MKNOD: parent,
  SYMLINK: parent,
  TMPFILE: parent,
  UNLINK: parent,
  RMDIR: parent,
  LINK: link,
  RENAME: rename,
  SETATTR: inode,
  SETXATTR: inode,
  REMOVEXATTR: inode,
  FSYNC: inode,
  BEGIN: inode,
  PUT: inode,
  END: end,
};

export class BenchProbe {
  private samples = new Map<string, Samples>();
  private segment = 0;
  private cpu = process.cpuUsage();
  private elu = performance.eventLoopUtilization();
  private readonly delay = monitorEventLoopDelay({ resolution: 1 });
  private readonly inspector = new Session();
  private readonly tails = new WeakMap<MountSession, Map<string, Promise<void>>>();

  private constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
    this.inspector.connect();
    this.delay.enable();
    process.on('SIGUSR2', () => {
      background(this.dump(), 'drive_mount.bench_dump_failed');
    });
    background(this.startProfiler(), 'drive_mount.bench_profiler_failed');
  }

  static fromEnvironment(): BenchProbe | null {
    const dir = env[VARIABLE];
    return dir === undefined || dir === '' ? null : new BenchProbe(dir);
  }

  private async startProfiler(): Promise<void> {
    await post(this.inspector, 'Profiler.enable');
    await post(this.inspector, 'Profiler.setSamplingInterval', { interval: SAMPLING_US });
    await post(this.inspector, 'Profiler.start');
  }

  private get parallel(): boolean {
    return existsSync(join(this.dir, PARALLEL_FLAG));
  }

  record(op: string, waitMs: number, runMs: number): void {
    const own = this.samples.get(op) ?? { wait: [], run: [] };
    own.wait.push(waitMs);
    own.run.push(runMs);
    this.samples.set(op, own);
  }

  enqueue(request: KeyedRequest, run: () => Promise<void>): boolean {
    if (!this.parallel) return false;
    const keyOf = KEYS[request.name];
    if (keyOf === undefined) return false;
    const keys = keyOf(request);
    const tails = this.tails.get(request.session) ?? new Map<string, Promise<void>>();
    this.tails.set(request.session, tails);
    const before = keys.map((key) => tails.get(key) ?? Promise.resolve());
    const mine = Promise.all(before).then(run);
    for (const key of keys) tails.set(key, mine);
    background(
      mine.then(() => {
        for (const key of keys) if (tails.get(key) === mine) tails.delete(key);
      }),
      'drive_mount.bench_keyed_failed',
    );
    return true;
  }

  private publish(name: string, content: string): void {
    const staged = join(this.dir, `${name}.tmp`);
    writeFileSync(staged, content);
    renameSync(staged, join(this.dir, name));
  }

  private async dump(): Promise<void> {
    this.segment += 1;
    const segment = String(this.segment);
    const { profile } = PROFILE.parse(await post(this.inspector, 'Profiler.stop'));
    await post(this.inspector, 'Profiler.start');
    const cpu = process.cpuUsage(this.cpu);
    const ops: Record<string, object> = {};
    for (const [name, own] of this.samples)
      ops[name] = { wait: summarize(own.wait), run: summarize(own.run) };
    const report = {
      segment: this.segment,
      ops,
      cpuUserMs: cpu.user / 1000,
      cpuSystemMs: cpu.system / 1000,
      eventLoopUtilization: performance.eventLoopUtilization(this.elu).utilization,
      eventLoopDelayMs: {
        p50: this.delay.percentile(50) / 1e6,
        p99: this.delay.percentile(99) / 1e6,
        max: this.delay.max / 1e6,
      },
    };
    this.samples = new Map();
    this.cpu = process.cpuUsage();
    this.elu = performance.eventLoopUtilization();
    this.delay.reset();
    this.publish(`hub-${segment}.cpuprofile`, JSON.stringify(profile));
    this.publish(`hub-${segment}.json`, JSON.stringify(report));
  }
}
