import type { ProcessList, ProcessQuery, ProcessRow, ProcessSignal } from '@smarteverything/domain';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { cpus } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { KernelFiles } from '../../collectors/linux/kernel-file';
import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import type { ProcessControl } from '../controls';
import { ioBytesOf, parseStat, type StatFields } from './proc-stat';
import { ownUid } from './sessions';

const USER_HZ = 100;
const SETTLE_MS = 500;
const FRESH_MS = 3000;
const COMMAND_MAX = 300;
const WARM_MS = 30_000;

const SIGNALS: Readonly<Record<ProcessSignal, NodeJS.Signals>> = {
  end: 'SIGTERM',
  force: 'SIGKILL',
  stop: 'SIGSTOP',
  continue: 'SIGCONT',
};

const SORTS: Readonly<Record<ProcessQuery['sort'], (row: ProcessRow) => number>> = {
  cpu: (row) => row.cpu,
  memory: (row) => row.memoryBytes,
  disk: (row) => row.diskRate,
};

interface Known {
  readonly start: string;
  readonly uid: number;
  readonly command: string;
  readonly ioDenied: boolean;
}

interface Reading {
  readonly pid: number;
  readonly stat: StatFields;
  readonly bytes: number | null;
}

interface Pass {
  readonly before: Sample;
  readonly now: Sample;
  readonly pageSize: number;
  readonly uid: number;
}

interface Sample {
  readonly at: number;
  readonly readings: ReadonlyMap<number, Reading>;
}

function commandOf(pid: number): string {
  return readFileSync(`/proc/${String(pid)}/cmdline`, 'utf8')
    .replaceAll('\0', ' ')
    .trim()
    .slice(0, COMMAND_MAX);
}

function vanished(cause: unknown): boolean {
  if (cause instanceof NodeFailureError) {
    return cause.code === 'not_found';
  }
  const code = cause instanceof Error && 'code' in cause ? cause.code : null;
  return code === 'ENOENT' || code === 'ESRCH';
}

function denied(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'EACCES';
}

function rate(now: number, before: number | undefined, seconds: number): number {
  return before === undefined || now < before ? 0 : (now - before) / seconds;
}

export class LinuxProcesses implements ProcessControl {
  private readonly files = new KernelFiles();
  private readonly known = new Map<number, Known>();
  private previous: Sample | null = null;
  private pageSize: number | null = null;
  private idle: NodeJS.Timeout | null = null;

  constructor(private readonly program: RunProgram) {}

  async list(query: ProcessQuery): Promise<ProcessList> {
    this.keepWarm();
    const pageSize = await this.pageBytes();
    if (this.previous === null || Date.now() - this.previous.at > FRESH_MS) {
      this.previous = this.sample();
      await delay(SETTLE_MS);
    }
    const before = this.previous;
    const now = this.sample();
    this.previous = now;
    const search = query.search?.toLowerCase();
    const uid = ownUid();
    const rows = [...now.readings.values()]
      .map((reading) => this.rowOf(reading, { before, now, pageSize, uid }))
      .filter(
        (row) =>
          search === undefined || `${row.name} ${row.command}`.toLowerCase().includes(search),
      )
      .sort((a, b) => SORTS[query.sort](b) - SORTS[query.sort](a));
    return {
      at: new Date(now.at).toISOString(),
      total: rows.length,
      processes: rows.slice(0, query.limit),
    };
  }

  signal(pid: number, signal: ProcessSignal): void {
    if (pid === process.pid) {
      throw new NodeFailureError('not_own', 'SmartEverything cannot end itself.');
    }
    if (this.ownerOf(pid) !== ownUid()) {
      throw new NodeFailureError('not_own', 'Only your own programs can be ended here.');
    }
    process.kill(pid, SIGNALS[signal]);
  }

  stop(): void {
    if (this.idle !== null) {
      clearTimeout(this.idle);
      this.idle = null;
    }
    this.files.closeAll();
    this.known.clear();
    this.previous = null;
  }

  private keepWarm(): void {
    if (this.idle !== null) {
      clearTimeout(this.idle);
    }
    this.idle = setTimeout(() => {
      this.stop();
    }, WARM_MS);
    this.idle.unref();
  }

  private async pageBytes(): Promise<number> {
    this.pageSize ??= Number(await this.program('getconf', ['PAGESIZE']));
    return this.pageSize;
  }

  private ownerOf(pid: number): number {
    try {
      return statSync(`/proc/${String(pid)}`).uid;
    } catch (cause) {
      if (vanished(cause)) {
        throw new NodeFailureError('not_found', 'That program has already closed.');
      }
      throw cause;
    }
  }

  private sample(): Sample {
    const readings = new Map<number, Reading>();
    for (const name of readdirSync('/proc')) {
      const pid = Number(name);
      const reading = Number.isInteger(pid) ? this.read(pid) : null;
      if (reading !== null) {
        readings.set(pid, reading);
      }
    }
    this.files.forget((path) => readings.has(Number(path.split('/')[2])));
    for (const pid of this.known.keys()) {
      if (!readings.has(pid)) {
        this.known.delete(pid);
      }
    }
    return { at: Date.now(), readings };
  }

  private read(pid: number): Reading | null {
    try {
      const stat = parseStat(this.files.read(`/proc/${String(pid)}/stat`));
      if (stat === null) {
        return null;
      }
      const known = this.knownOf(pid, stat.start);
      return { pid, stat, bytes: this.bytesOf(pid, known) };
    } catch (cause) {
      if (vanished(cause)) {
        return null;
      }
      throw cause;
    }
  }

  private knownOf(pid: number, start: string): Known {
    const known = this.known.get(pid);
    if (known?.start === start) {
      return known;
    }
    const fresh = { start, uid: this.ownerOf(pid), command: commandOf(pid), ioDenied: false };
    this.known.set(pid, fresh);
    return fresh;
  }

  private bytesOf(pid: number, known: Known): number | null {
    if (known.ioDenied) {
      return null;
    }
    try {
      return ioBytesOf(this.files.read(`/proc/${String(pid)}/io`));
    } catch (cause) {
      if (!denied(cause)) {
        throw cause;
      }
      this.known.set(pid, { ...known, ioDenied: true });
      return null;
    }
  }

  private rowOf(reading: Reading, { before, now, pageSize, uid }: Pass): ProcessRow {
    const seconds = Math.max(0.001, (now.at - before.at) / 1000);
    const earlier = before.readings.get(reading.pid);
    const same = earlier?.stat.start === reading.stat.start ? earlier : undefined;
    const cpu = rate(reading.stat.ticks, same?.stat.ticks, seconds) / USER_HZ / cpus().length;
    const known = this.known.get(reading.pid);
    return {
      pid: reading.pid,
      name: reading.stat.name,
      command: known?.command ?? '',
      state: reading.stat.state,
      cpu: Math.min(100, cpu * 100),
      memoryBytes: reading.stat.rssPages * pageSize,
      diskRate: reading.bytes === null ? 0 : rate(reading.bytes, same?.bytes ?? undefined, seconds),
      threads: reading.stat.threads,
      own: known?.uid === uid,
    };
  }
}
