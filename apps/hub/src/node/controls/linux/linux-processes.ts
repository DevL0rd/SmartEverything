import type {
  ProcessList,
  ProcessQuery,
  ProcessRow,
  ProcessSignal,
  ProcessWindow,
  ProcessesUpdate,
} from '@smarteverything/domain';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { KernelFile, KernelFiles } from '../../collectors/linux/kernel-file';
import { pageBytes } from '../../collectors/linux/page-size';
import { percent, rate, toStep } from '../../collectors/rounding';
import { fsCode } from '../../../fs-code';
import type { Tick } from '../../collectors/tick';
import { NodeFailureError } from '../../node-failure';
import type { ProcessControl } from '../controls';
import { GpuProcessUsage } from './gpu-processes';
import { arrange, defaultOrder, WindowDiff, type Arrangement } from '../process-window';
import { ioBytesOf, parsePasswd, parseStat, totalJiffiesOf, type StatFields } from './proc-stat';
import { ownUid } from './sessions';

const SETTLE_MS = 500;
const FRESH_MS = 3000;
const MIN_BASELINE_MS = 400;
const WARM_MS = 30_000;
const MEMORY_STEP_BYTES = 65_536;
const COMMAND_MAX = 300;

const SIGNALS: Readonly<Record<ProcessSignal, NodeJS.Signals>> = {
  end: 'SIGTERM',
  force: 'SIGKILL',
  stop: 'SIGSTOP',
  continue: 'SIGCONT',
};

interface Known {
  readonly start: number;
  readonly uid: number;
  readonly user: string;
  readonly command: string;
  readonly statPath: string;
  readonly ioPath: string;
}

interface Entry {
  readonly pid: number;
  readonly stat: StatFields;
  readonly known: Known;
}

interface Sweep {
  readonly at: number;
  readonly jiffies: number;
  readonly entries: ReadonlyMap<number, Entry>;
}

interface IoReading {
  readonly bytes: number;
  readonly at: number;
  readonly start: number;
}

function vanished(cause: unknown): boolean {
  if (cause instanceof NodeFailureError) {
    return cause.code === 'not_found';
  }
  const code = fsCode(cause);
  return code === 'ENOENT' || code === 'ESRCH';
}

export function sendSignal(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch (cause) {
    const code = fsCode(cause);
    if (code === 'EPERM') {
      throw new NodeFailureError('not_own', 'Only your own programs can be ended here.');
    }
    if (code === 'ESRCH') {
      throw new NodeFailureError('not_found', 'That program has already closed.');
    }
    throw cause;
  }
}

function pidOf(name: string): number | null {
  const first = name.charCodeAt(0);
  return first >= 49 && first <= 57 ? Number(name) : null;
}

export function cpuShare(
  now: Pick<StatFields, 'ticks' | 'start'>,
  before: Pick<StatFields, 'ticks' | 'start'> | undefined,
  jiffiesElapsed: number,
): number {
  if (before?.start !== now.start || jiffiesElapsed <= 0) {
    return 0;
  }
  return Math.max(0, ((now.ticks - before.ticks) / jiffiesElapsed) * 100);
}

export class LinuxProcesses implements ProcessControl {
  private readonly files = new KernelFiles();
  private readonly total = new KernelFile('/proc/stat');
  private readonly known = new Map<number, Known>();
  private readonly io = new Map<number, IoReading>();
  private readonly diskRates = new Map<number, number>();
  private readonly ioDenied = new Set<number>();
  private readonly gpu = new GpuProcessUsage();
  private readonly diff = new WindowDiff();
  private baseline: Sweep | null = null;
  private latest: Sweep | null = null;
  private window: ProcessWindow | null = null;
  private idle: NodeJS.Timeout | null = null;
  private users = parsePasswd(readFileSync('/etc/passwd', 'utf8'));

  watch(window: ProcessWindow | null): void {
    this.window = window;
    this.gpu.setActive(window?.gpu === true);
    if (window === null) {
      this.keepWarm();
      return;
    }
    this.cancelIdle();
  }

  read(tick: Tick): ProcessesUpdate | null {
    const window = this.window;
    if (window === null) {
      return null;
    }
    const sweep = this.sweep(tick.at);
    const ordered = arrange(this.rowsOf(sweep, window.sort === 'disk' || window.tree), window);
    const visible = this.withDisk(
      ordered.slice(window.offset, window.offset + window.limit),
      sweep,
    );
    return this.diff.next(visible, { total: ordered.length, offset: window.offset }, tick.key);
  }

  async list(query: ProcessQuery): Promise<ProcessList> {
    this.keepWarm();
    const sweep = await this.freshSweep();
    const arrangement: Arrangement = {
      sort: query.sort,
      order: query.order ?? defaultOrder(query.sort),
      search: query.search,
      tree: query.tree ?? false,
    };
    const ordered = arrange(
      this.rowsOf(sweep, query.sort === 'disk' || arrangement.tree),
      arrangement,
    );
    const end = query.cursor + query.limit;
    return {
      at: new Date(sweep.at).toISOString(),
      total: ordered.length,
      next: end < ordered.length ? end : null,
      processes: this.withDisk(ordered.slice(query.cursor, end), sweep),
    };
  }

  private async freshSweep(): Promise<Sweep> {
    const latest = this.latest;
    const now = Date.now();
    if (latest !== null && this.baseline !== null && now - latest.at < MIN_BASELINE_MS) {
      return latest;
    }
    if (latest === null || this.baseline === null || now - latest.at > FRESH_MS) {
      this.baseline = null;
      this.latest = null;
      this.sweep(now);
      await delay(SETTLE_MS);
    }
    return this.sweep(Date.now());
  }

  signal(pid: number, signal: ProcessSignal): void {
    if (pid === process.pid) {
      throw new NodeFailureError('not_own', 'SmartEverything cannot end itself.');
    }
    sendSignal(pid, SIGNALS[signal]);
  }

  stop(): void {
    this.cancelIdle();
    this.gpu.stop();
    this.files.closeAll();
    this.total.close();
    this.known.clear();
    this.io.clear();
    this.diskRates.clear();
    this.ioDenied.clear();
    this.baseline = null;
    this.latest = null;
    this.window = null;
  }

  private keepWarm(): void {
    this.cancelIdle();
    this.idle = setTimeout(() => {
      this.stop();
    }, WARM_MS);
    this.idle.unref();
  }

  private cancelIdle(): void {
    if (this.idle !== null) {
      clearTimeout(this.idle);
      this.idle = null;
    }
  }

  private sweep(at: number): Sweep {
    const entries = new Map<number, Entry>();
    for (const name of readdirSync('/proc')) {
      const pid = pidOf(name);
      const entry = pid === null ? null : this.entryOf(pid);
      if (entry !== null) {
        entries.set(entry.pid, entry);
      }
    }
    this.forgetGone(entries);
    const sweep = { at, jiffies: totalJiffiesOf(this.total.read()), entries };
    if (this.latest !== null && at - this.latest.at >= MIN_BASELINE_MS) {
      this.baseline = this.latest;
    }
    this.latest = sweep;
    this.gpu.sample(entries.keys(), at);
    return sweep;
  }

  private forgetGone(entries: ReadonlyMap<number, Entry>): void {
    for (const [pid, known] of this.known) {
      if (!entries.has(pid)) {
        this.files.drop(known.statPath);
        this.files.drop(known.ioPath);
      }
    }
    for (const store of [this.known, this.io, this.diskRates, this.ioDenied]) {
      for (const pid of store.keys()) {
        if (!entries.has(pid)) {
          store.delete(pid);
        }
      }
    }
  }

  private entryOf(pid: number): Entry | null {
    const known = this.known.get(pid);
    try {
      const stat = parseStat(this.files.read(known?.statPath ?? `/proc/${String(pid)}/stat`));
      return stat === null ? null : { pid, stat, known: this.knownOf(pid, stat.start, known) };
    } catch (cause) {
      if (vanished(cause)) {
        return null;
      }
      throw cause;
    }
  }

  private knownOf(pid: number, start: number, known: Known | undefined): Known {
    if (known?.start === start) {
      return known;
    }
    const uid = statSync(`/proc/${String(pid)}`).uid;
    const fresh = {
      start,
      uid,
      user: this.userName(uid),
      command: readFileSync(`/proc/${String(pid)}/cmdline`, 'utf8')
        .replaceAll('\0', ' ')
        .trim()
        .slice(0, COMMAND_MAX),
      statPath: `/proc/${String(pid)}/stat`,
      ioPath: `/proc/${String(pid)}/io`,
    };
    this.known.set(pid, fresh);
    return fresh;
  }

  private userName(uid: number): string {
    let name = this.users.get(uid);
    if (name === undefined) {
      this.users = parsePasswd(readFileSync('/etc/passwd', 'utf8'));
      name = this.users.get(uid) ?? String(uid);
    }
    return name;
  }

  private rowsOf(sweep: Sweep, wide: boolean): ProcessRow[] {
    const uid = ownUid();
    const before = this.baseline;
    const elapsed = before === null ? 0 : sweep.jiffies - before.jiffies;
    const page = pageBytes();
    if (wide) {
      this.readIo([...sweep.entries.values()], sweep.at);
    }
    return [...sweep.entries.values()].map((entry) => ({
      pid: entry.pid,
      start: entry.stat.start,
      ppid: entry.stat.ppid,
      name: entry.stat.name === '' ? String(entry.pid) : entry.stat.name,
      command: entry.known.command,
      user: entry.known.user,
      state: entry.stat.state,
      cpu: percent(cpuShare(entry.stat, before?.entries.get(entry.pid)?.stat, elapsed)),
      memoryBytes: toStep(entry.stat.rssPages * page, MEMORY_STEP_BYTES),
      gpu: this.gpu.usageOf(entry.pid, sweep.at),
      diskRate: this.diskRates.get(entry.pid) ?? 0,
      threads: entry.stat.threads,
      descendants: 0,
      own: entry.known.uid === uid,
    }));
  }

  private withDisk(rows: readonly ProcessRow[], sweep: Sweep): ProcessRow[] {
    const entries = rows.flatMap((row) => {
      const entry = sweep.entries.get(row.pid);
      return entry === undefined ? [] : [entry];
    });
    this.readIo(entries, sweep.at);
    return rows.map((row) => ({ ...row, diskRate: this.diskRates.get(row.pid) ?? row.diskRate }));
  }

  private readIo(entries: readonly Entry[], at: number): void {
    for (const { pid, stat, known } of entries) {
      const bytes = this.bytesOf(pid, known);
      if (bytes === null) {
        continue;
      }
      const before = this.io.get(pid);
      const fresh = before?.start === stat.start && at - before.at <= FRESH_MS && at > before.at;
      this.diskRates.set(
        pid,
        before !== undefined && fresh && bytes >= before.bytes
          ? rate(((bytes - before.bytes) * 1000) / (at - before.at))
          : 0,
      );
      this.io.set(pid, { bytes, at, start: stat.start });
    }
  }

  private bytesOf(pid: number, known: Known): number | null {
    if (this.ioDenied.has(pid)) {
      return null;
    }
    try {
      return ioBytesOf(this.files.read(known.ioPath));
    } catch (cause) {
      if (vanished(cause)) {
        return null;
      }
      if (fsCode(cause) !== 'EACCES') {
        throw cause;
      }
      this.ioDenied.add(pid);
      return null;
    }
  }
}
