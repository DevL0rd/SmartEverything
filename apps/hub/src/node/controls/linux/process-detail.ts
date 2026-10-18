import { PROCESS_DETAIL, type ProcessDetail } from '@smarteverything/domain';
import { readdir, readFile, readlink } from 'node:fs/promises';
import { setPriority } from 'node:os';
import { join } from 'node:path';
import { NodeFailureError } from '../../node-failure';
import { fsCode } from '../../../fs-code';
import { UNREADABLE, orElse } from './fs-fallback';
import { parseStat } from './proc-stat';
import { ownUid } from './sessions';

const USER_HZ = 100;
const COMMAND_LINE_MAX = 2000;
const NICE_FIELD = 16;

export interface ProcessDetailOptions {
  readonly proc: string;
  readonly passwd: string;
  readonly uid: () => number;
  readonly setNice: (pid: number, nice: number) => void;
}

const DEFAULTS: ProcessDetailOptions = {
  proc: '/proc',
  passwd: '/etc/passwd',
  uid: ownUid,
  setNice: setPriority,
};

function afterName(stat: string): readonly string[] {
  return stat
    .slice(stat.lastIndexOf(')') + 2)
    .trim()
    .split(' ');
}

function statusField(status: string, key: string): string {
  return new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(status)?.[1]?.trim() ?? '';
}

async function text(path: string): Promise<string | null> {
  return orElse(readFile(path, 'utf8'), null, UNREADABLE);
}

async function link(path: string): Promise<string | null> {
  return orElse(readlink(path), null, UNREADABLE);
}

async function userNames(passwd: string): Promise<ReadonlyMap<number, string>> {
  const found = new Map<number, string>();
  for (const line of ((await text(passwd)) ?? '').split('\n')) {
    const [name = '', , id = ''] = line.split(':');
    if (name !== '' && id !== '') {
      found.set(Number(id), name);
    }
  }
  return found;
}

function niceOf(after: readonly string[]): number | null {
  const nice = Number(after[NICE_FIELD]);
  return Number.isFinite(nice) ? nice : null;
}

async function commandOf(folder: string): Promise<string> {
  const raw = (await text(join(folder, 'cmdline'))) ?? '';
  return raw.replaceAll('\0', ' ').trim().slice(0, COMMAND_LINE_MAX);
}

async function cgroupOf(folder: string): Promise<string | null> {
  const raw = (await text(join(folder, 'cgroup'))) ?? '';
  return /^0::(.*)$/m.exec(raw)?.[1] ?? null;
}

export class ProcessDetails {
  private readonly options: ProcessDetailOptions;

  constructor(options: Partial<ProcessDetailOptions> = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  async detail(pid: number): Promise<ProcessDetail> {
    const folder = join(this.options.proc, String(pid));
    const [stat, status] = await Promise.all([
      text(join(folder, 'stat')),
      text(join(folder, 'status')),
    ]);
    const fields = stat === null ? null : parseStat(stat);
    if (stat === null || status === null || fields === null) {
      throw new NodeFailureError('not_found', 'That program has already finished.');
    }
    const after = afterName(stat);
    const ppid = fields.ppid;
    const uid = Number(statusField(status, 'Uid').split(/\s+/)[0]);
    const [relations, links, startedAt, users] = await Promise.all([
      this.relations(pid, ppid),
      this.links(folder),
      this.startOf(fields.start),
      userNames(this.options.passwd),
    ]);
    return PROCESS_DETAIL.parse({
      pid,
      name: fields.name,
      command: await commandOf(folder),
      ...links,
      startedAt,
      ppid,
      ...relations,
      user: users.get(uid) ?? String(uid),
      threads: fields.threads,
      niceness: niceOf(after),
      cgroup: await cgroupOf(folder),
      own: uid === this.options.uid(),
    });
  }

  async prioritise(pid: number, nice: number): Promise<void> {
    const detail = await this.detail(pid);
    if (!detail.own) {
      throw new NodeFailureError('not_own', 'Only your own programs can be changed.');
    }
    if (detail.niceness !== null && nice < detail.niceness) {
      throw new NodeFailureError(
        'not_permitted',
        'A program can only be given lower priority here.',
      );
    }
    try {
      this.options.setNice(pid, nice);
    } catch (cause) {
      const code = fsCode(cause);
      if (code === 'ESRCH') {
        throw new NodeFailureError('not_found', 'That program has already finished.');
      }
      if (code === 'EACCES' || code === 'EPERM') {
        throw new NodeFailureError(
          'not_permitted',
          'The signed-in user cannot change that program.',
        );
      }
      throw cause;
    }
  }

  private async relations(
    pid: number,
    ppid: number,
  ): Promise<{
    readonly children: readonly { readonly pid: number; readonly name: string }[];
    readonly parentName: string | null;
  }> {
    const [children, parent] = await Promise.all([
      this.childrenOf(pid),
      text(join(this.options.proc, String(ppid), 'comm')),
    ]);
    const parentName = parent?.trim() ?? '';
    return { children, parentName: parentName === '' ? null : parentName };
  }

  private async links(folder: string): Promise<{
    readonly executable: string | null;
    readonly workingDirectory: string | null;
    readonly openFiles: number | null;
    readonly sockets: number | null;
  }> {
    const [executable, workingDirectory, descriptors] = await Promise.all([
      link(join(folder, 'exe')),
      link(join(folder, 'cwd')),
      this.descriptors(folder),
    ]);
    return {
      executable,
      workingDirectory,
      openFiles: descriptors?.total ?? null,
      sockets: descriptors?.sockets ?? null,
    };
  }

  private async descriptors(
    folder: string,
  ): Promise<{ readonly total: number; readonly sockets: number } | null> {
    const names = await orElse<string[] | null>(readdir(join(folder, 'fd')), null, UNREADABLE);
    if (names === null) {
      return null;
    }
    const targets = await Promise.all(names.map((name) => link(join(folder, 'fd', name))));
    return {
      total: names.length,
      sockets: targets.filter((target) => target?.startsWith('socket:') === true).length,
    };
  }

  private async childrenOf(
    pid: number,
  ): Promise<readonly { readonly pid: number; readonly name: string }[]> {
    const all = await orElse<string[]>(readdir(this.options.proc), [], UNREADABLE);
    const rows = await Promise.all(
      all
        .filter((name) => /^\d+$/.test(name))
        .map(async (name) => {
          const stat = await text(join(this.options.proc, name, 'stat'));
          const fields = stat === null ? null : parseStat(stat);
          return fields?.ppid === pid ? { pid: Number(name), name: fields.name } : null;
        }),
    );
    return rows.filter((row) => row !== null);
  }

  private async startOf(ticks: number): Promise<string> {
    const stat = (await text(join(this.options.proc, 'stat'))) ?? '';
    const boot = Number(/^btime\s+(\d+)/m.exec(stat)?.[1]);
    if (!Number.isFinite(boot)) {
      throw new NodeFailureError('failed', 'The boot time of this computer could not be read.');
    }
    return new Date((boot + ticks / USER_HZ) * 1000).toISOString();
  }
}
