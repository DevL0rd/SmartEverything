import { basename } from 'node:path';
import { z } from 'zod';
import { runProgram, type RunProgram } from '../../run-program';
import type { ProcessSource, RawProcess } from '../portable/portable-processes';

const KIB = 1024;
const ROW =
  /^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(\w{3}\s+\w{3}\s+\d+\s+[\d:]+\s+\d{4})\s+(.*)$/u;
const NAMED = /^\s*(\d+)\s+(.+)$/u;

export function parseCommands(text: string): ReadonlyMap<number, string> {
  const names = new Map<number, string>();
  for (const line of text.split('\n')) {
    const match = NAMED.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined)
      names.set(Number(match[1]), match[2].trim());
  }
  return names;
}

export function parseUsers(text: string): ReadonlyMap<string, string> {
  const users = new Map<string, string>();
  for (const line of text.split('\n')) {
    const match = /^(\S+)\s+(\d+)\s*$/u.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) users.set(match[2], match[1]);
  }
  return users;
}

const SWEEP_FIELDS = z.tuple([
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
]);

export function parseSweep(
  text: string,
  executables: ReadonlyMap<number, string>,
  users: ReadonlyMap<string, string>,
): readonly RawProcess[] {
  return text.split('\n').flatMap((line): RawProcess[] => {
    const match = ROW.exec(line);
    const fields = SWEEP_FIELDS.safeParse(match?.slice(1));
    if (!fields.success) return [];
    const [pid, ppid, cpu, rss, uid, started, command] = fields.data;
    const executable = executables.get(Number(pid)) ?? command;
    return [
      {
        pid: Number(pid),
        ppid: Number(ppid),
        name: basename(executable) === '' ? pid : basename(executable),
        command: command.trim(),
        user: users.get(uid) ?? uid,
        start: Date.parse(started),
        memoryBytes: Number(rss) * KIB,
        threads: 0,
        cpuSeconds: null,
        cpuPercentOfOneCore: Number(cpu),
      },
    ];
  });
}

export class DarwinProcessSource implements ProcessSource {
  private users: ReadonlyMap<string, string> | null = null;

  constructor(private readonly run: RunProgram = runProgram) {}

  async sweep(): Promise<readonly RawProcess[]> {
    const [table, executables] = await Promise.all([
      this.run('ps', ['-Aww', '-o', 'pid=,ppid=,pcpu=,rss=,uid=,lstart=,command=']),
      this.run('ps', ['-Aww', '-o', 'pid=,comm=']),
    ]);
    return parseSweep(table, parseCommands(executables), await this.userNames());
  }

  private async userNames(): Promise<ReadonlyMap<string, string>> {
    this.users ??= parseUsers(await this.run('dscl', ['.', '-list', '/Users', 'UniqueID']));
    return this.users;
  }
}
