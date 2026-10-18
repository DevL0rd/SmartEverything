import { Logger } from '@smarteverything/logging';
import { spawn, type ChildProcess } from 'node:child_process';
import { readdirSync, readFileSync, readlinkSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { hasNvidiaDriver } from '../../collectors/linux/gpu-nvidia';
import { percent } from '../../collectors/rounding';

const log = new Logger('hub.node');

const SEEN_MS = 5000;
const PMON_SECONDS = '2';
const DISCOVER_MS = 10_000;
const NS_PER_MS = 1_000_000;
const DRI_PREFIX = '/dev/dri/';

interface Seen {
  readonly percent: number;
  readonly at: number;
}

interface Engine {
  readonly ns: number;
  readonly at: number;
}

export function parsePmonLine(line: string): [number, number] | null {
  if (line.startsWith('#')) {
    return null;
  }
  const fields = line.trim().split(/\s+/);
  const pid = Number(fields[1]);
  const sm = fields[3] === '-' ? 0 : Number(fields[3]);
  return Number.isInteger(pid) && pid > 0 && Number.isFinite(sm) ? [pid, sm] : null;
}

export function parseFdinfo(
  text: string,
): { readonly client: string; readonly busyNs: number } | null {
  const client = /^drm-client-id:\s*(\d+)/m.exec(text)?.[1];
  if (client === undefined) {
    return null;
  }
  const engines = [...text.matchAll(/^drm-engine-[\w-]+:\s*(\d+)\s*ns/gm)].map((match) =>
    Number(match[1]),
  );
  return engines.length === 0 ? null : { client, busyNs: Math.max(...engines) };
}

export class GpuProcessUsage {
  private readonly seen = new Map<number, Seen>();
  private readonly engines = new Map<string, Engine>();
  private readonly paths = new Map<number, string[]>();
  private pmon: ChildProcess | null = null;
  private discoveredAt = Number.NEGATIVE_INFINITY;
  private active = false;

  get available(): boolean {
    return this.pmon !== null || this.paths.size > 0;
  }

  setActive(active: boolean): void {
    if (active === this.active) {
      return;
    }
    this.active = active;
    log.info('node.gpu_processes_changed', { active });
    if (active && hasNvidiaDriver()) {
      this.startPmon();
      return;
    }
    if (!active) {
      this.stop();
    }
  }

  usageOf(pid: number, at: number): number | null {
    if (!this.active) {
      return null;
    }
    const seen = this.seen.get(pid);
    return seen !== undefined && at - seen.at <= SEEN_MS ? seen.percent : this.available ? 0 : null;
  }

  sample(pids: Iterable<number>, at: number): void {
    if (!this.active) {
      return;
    }
    const alive = new Set(pids);
    this.forgetGone(alive);
    if (this.pmon !== null) {
      return;
    }
    if (at - this.discoveredAt >= DISCOVER_MS) {
      this.discoveredAt = at;
      this.discover(alive);
    }
    for (const [pid, paths] of this.paths) {
      this.readEngines(pid, paths, at);
    }
  }

  stop(): void {
    this.active = false;
    this.pmon?.kill();
    this.pmon = null;
    this.seen.clear();
    this.engines.clear();
    this.paths.clear();
    this.discoveredAt = Number.NEGATIVE_INFINITY;
  }

  private startPmon(): void {
    const child = spawn('nvidia-smi', ['pmon', '-s', 'u', '-d', PMON_SECONDS], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    this.pmon = child;
    createInterface({ input: child.stdout }).on('line', (line) => {
      const parsed = parsePmonLine(line);
      if (parsed !== null) {
        this.seen.set(parsed[0], { percent: percent(parsed[1]), at: Date.now() });
      }
    });
    child.once('error', (cause) => {
      this.pmon = null;
      log.warn('node.gpu_processes_unavailable', { reason: cause.message });
    });
    child.once('exit', () => {
      if (this.pmon === child) {
        this.pmon = null;
      }
    });
  }

  private forgetGone(alive: ReadonlySet<number>): void {
    for (const pid of this.seen.keys()) {
      if (!alive.has(pid)) {
        this.seen.delete(pid);
      }
    }
    for (const key of this.engines.keys()) {
      if (!alive.has(Number(key.slice(0, key.indexOf(':'))))) {
        this.engines.delete(key);
      }
    }
    for (const pid of this.paths.keys()) {
      if (!alive.has(pid)) {
        this.paths.delete(pid);
      }
    }
  }

  private discover(pids: Iterable<number>): void {
    this.paths.clear();
    for (const pid of pids) {
      const found = this.driPaths(pid);
      if (found.length > 0) {
        this.paths.set(pid, found);
      }
    }
  }

  private driPaths(pid: number): string[] {
    try {
      return readdirSync(`/proc/${String(pid)}/fd`)
        .filter((fd) => readlinkSync(`/proc/${String(pid)}/fd/${fd}`).startsWith(DRI_PREFIX))
        .map((fd) => `/proc/${String(pid)}/fdinfo/${fd}`);
    } catch (cause) {
      if (cause instanceof Error) {
        return [];
      }
      throw cause;
    }
  }

  private readEngines(pid: number, paths: readonly string[], at: number): void {
    let busy = 0;
    const clients = new Set<string>();
    for (const path of paths) {
      const info = this.fdinfo(path);
      if (info === null || clients.has(info.client)) {
        continue;
      }
      clients.add(info.client);
      const key = `${String(pid)}:${info.client}`;
      const before = this.engines.get(key);
      this.engines.set(key, { ns: info.busyNs, at });
      if (before !== undefined && at > before.at) {
        busy += (info.busyNs - before.ns) / ((at - before.at) * NS_PER_MS);
      }
    }
    this.seen.set(pid, { percent: percent(busy * 100), at });
  }

  private fdinfo(path: string): ReturnType<typeof parseFdinfo> {
    try {
      return parseFdinfo(readFileSync(path, 'utf8'));
    } catch (cause) {
      if (cause instanceof Error) {
        return null;
      }
      throw cause;
    }
  }
}
