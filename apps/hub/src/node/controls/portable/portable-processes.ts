import {
  processKey,
  type ProcessList,
  type ProcessQuery,
  type ProcessRow,
  type ProcessSignal,
  type ProcessWindow,
  type ProcessesUpdate,
} from '@smarteverything/domain';
import { cpus } from 'node:os';
import { fsCode } from '../../../fs-code';
import { AsyncReading } from '../../collectors/portable/async-reading';
import { percent, toStep } from '../../collectors/rounding';
import type { Tick } from '../../collectors/tick';
import { NodeFailureError } from '../../node-failure';
import type { ProcessControl } from '../controls';
import { arrange, defaultOrder, WindowDiff, type Arrangement } from '../process-window';
import type { MachineName } from './unsupported';

const MEMORY_STEP_BYTES = 65_536;
const FRESH_MS = 1000;

export interface RawProcess {
  readonly pid: number;
  readonly ppid: number;
  readonly name: string;
  readonly command: string;
  readonly user: string;
  readonly start: number;
  readonly memoryBytes: number;
  readonly threads: number;
  readonly cpuSeconds: number | null;
  readonly cpuPercentOfOneCore: number | null;
}

export interface ProcessSource {
  readonly sweep: () => Promise<readonly RawProcess[]>;
}

export type SignalNames = Readonly<Record<ProcessSignal, NodeJS.Signals | null>>;

interface Sweep {
  readonly at: number;
  readonly processes: readonly RawProcess[];
}

export interface PortableProcessOptions {
  readonly machine: MachineName;
  readonly source: ProcessSource;
  readonly signals: SignalNames;
  readonly ownUser: string;
  readonly ownPid: number;
  readonly now: () => number;
  readonly failed: (cause: unknown) => void;
}

function sameUser(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export class PortableProcesses implements ProcessControl {
  private readonly diff = new WindowDiff();
  private readonly cores = Math.max(cpus().length, 1);
  private readonly reading: AsyncReading<Sweep>;
  private previous: Sweep | null = null;
  private current: Sweep | null = null;
  private window: ProcessWindow | null = null;

  constructor(private readonly options: PortableProcessOptions) {
    this.reading = new AsyncReading(() => this.take(), options.failed);
  }

  watch(window: ProcessWindow | null): void {
    this.window = window;
    if (window !== null) this.reading.read();
  }

  read(tick: Tick): ProcessesUpdate | null {
    const window = this.window;
    if (window === null) return null;
    const sweep = this.reading.read()?.value;
    if (sweep === undefined) return null;
    const ordered = arrange(this.rowsOf(sweep), window);
    return this.diff.next(
      ordered.slice(window.offset, window.offset + window.limit),
      { total: ordered.length, offset: window.offset },
      tick.key,
    );
  }

  async list(query: ProcessQuery): Promise<ProcessList> {
    const sweep = await this.fresh();
    const arrangement: Arrangement = {
      sort: query.sort,
      order: query.order ?? defaultOrder(query.sort),
      search: query.search,
      tree: query.tree ?? false,
    };
    const ordered = arrange(this.rowsOf(sweep), arrangement);
    const end = query.cursor + query.limit;
    return {
      at: new Date(sweep.at).toISOString(),
      total: ordered.length,
      next: end < ordered.length ? end : null,
      processes: ordered.slice(query.cursor, end),
    };
  }

  signal(pid: number, signal: ProcessSignal): void {
    const name = this.options.signals[signal];
    if (name === null) {
      throw new NodeFailureError(
        'not_supported',
        `${this.options.machine} cannot ${signal === 'stop' ? 'pause' : 'resume'} a program from here.`,
      );
    }
    if (pid === this.options.ownPid) {
      throw new NodeFailureError('not_own', 'SmartEverything cannot end itself.');
    }
    terminate(pid, name);
  }

  stop(): void {
    this.window = null;
    this.previous = null;
    this.current = null;
  }

  private async fresh(): Promise<Sweep> {
    const current = this.current;
    if (current !== null && this.options.now() - current.at < FRESH_MS) return current;
    await this.reading.prime();
    const latest = this.current;
    if (latest === null)
      throw new NodeFailureError('failed', 'The program list could not be read.');
    return latest;
  }

  private async take(): Promise<Sweep> {
    const processes = await this.options.source.sweep();
    const sweep = { at: this.options.now(), processes };
    this.previous = this.current;
    this.current = sweep;
    return sweep;
  }

  private rowsOf(sweep: Sweep): ProcessRow[] {
    const before = new Map(this.previous?.processes.map((item) => [processKey(item), item]));
    const elapsed = this.previous === null ? 0 : (sweep.at - this.previous.at) / 1000;
    return sweep.processes.map((item) => ({
      pid: item.pid,
      start: item.start,
      ppid: item.ppid,
      name: item.name,
      command: item.command,
      user: item.user,
      state: 'running',
      cpu: percent(this.cpuOf(item, before.get(processKey(item)), elapsed)),
      memoryBytes: toStep(item.memoryBytes, MEMORY_STEP_BYTES),
      gpu: null,
      diskRate: 0,
      threads: item.threads,
      descendants: 0,
      own: sameUser(item.user, this.options.ownUser),
    }));
  }

  private cpuOf(item: RawProcess, before: RawProcess | undefined, elapsed: number): number {
    if (item.cpuPercentOfOneCore !== null) return item.cpuPercentOfOneCore / this.cores;
    const earlier = before?.cpuSeconds;
    if (item.cpuSeconds === null || earlier === null || earlier === undefined || elapsed <= 0) {
      return 0;
    }
    return ((item.cpuSeconds - earlier) / elapsed / this.cores) * 100;
  }
}

function terminate(pid: number, signal: NodeJS.Signals): void {
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
