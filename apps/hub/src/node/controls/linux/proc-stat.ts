import type { ProcessRow } from '@smarteverything/domain';

export interface StatFields {
  readonly name: string;
  readonly state: ProcessRow['state'];
  readonly ticks: number;
  readonly threads: number;
  readonly start: string;
  readonly rssPages: number;
}

const STATES: Readonly<Record<string, ProcessRow['state']>> = {
  R: 'running',
  S: 'sleeping',
  D: 'sleeping',
  I: 'sleeping',
  T: 'stopped',
  t: 'stopped',
  Z: 'zombie',
};

export function parseStat(text: string): StatFields | null {
  const open = text.indexOf('(');
  const close = text.lastIndexOf(')');
  if (open < 0 || close <= open) {
    return null;
  }
  const rest = text
    .slice(close + 2)
    .trim()
    .split(' ');
  const [state = '', , , , , , , , , , , utime = '0', stime = '0'] = rest;
  return {
    name: text.slice(open + 1, close),
    state: STATES[state] ?? 'other',
    ticks: Number(utime) + Number(stime),
    threads: Number(rest[17] ?? 0),
    start: rest[19] ?? '',
    rssPages: Number(rest[21] ?? 0),
  };
}

export function ioBytesOf(text: string): number {
  const read = /^read_bytes:\s+(\d+)/m.exec(text)?.[1];
  const written = /^write_bytes:\s+(\d+)/m.exec(text)?.[1];
  return Number(read ?? 0) + Number(written ?? 0);
}
