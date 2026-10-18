import type { ProcessRow } from '@smarteverything/domain';

export interface StatFields {
  readonly name: string;
  readonly state: ProcessRow['state'];
  readonly ppid: number;
  readonly ticks: number;
  readonly threads: number;
  readonly start: number;
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

const LAST_FIELD = 21;
const JIFFY_FIELDS = 8;
const STATE_FIELD = 0;
const PPID_FIELD = 1;
const UTIME_FIELD = 11;
const STIME_FIELD = 12;
const THREADS_FIELD = 17;
const START_FIELD = 19;
const WANTED: ReadonlySet<number> = new Set([
  STATE_FIELD,
  PPID_FIELD,
  UTIME_FIELD,
  STIME_FIELD,
  THREADS_FIELD,
  START_FIELD,
  LAST_FIELD,
]);

function wantedFields(text: string, from: number): Map<number, string> {
  const found = new Map<number, string>();
  let cursor = from;
  for (let index = 0; index <= LAST_FIELD && cursor <= text.length; index += 1) {
    const space = text.indexOf(' ', cursor);
    const end = space === -1 ? text.length : space;
    if (WANTED.has(index)) {
      found.set(index, text.slice(cursor, end));
    }
    cursor = end + 1;
  }
  return found;
}

export function parseStat(text: string): StatFields | null {
  const open = text.indexOf('(');
  const close = text.lastIndexOf(')');
  if (open < 0 || close <= open) {
    return null;
  }
  const fields = wantedFields(text, close + 2);
  const fieldNumber = (index: number): number => Number(fields.get(index) ?? 0);
  return {
    name: text.slice(open + 1, close),
    state: STATES[fields.get(STATE_FIELD) ?? ''] ?? 'other',
    ppid: fieldNumber(PPID_FIELD),
    ticks: fieldNumber(UTIME_FIELD) + fieldNumber(STIME_FIELD),
    threads: fieldNumber(THREADS_FIELD),
    start: fieldNumber(START_FIELD),
    rssPages: fieldNumber(LAST_FIELD),
  };
}

export function ioBytesOf(text: string): number {
  const read = /^read_bytes:\s+(\d+)/m.exec(text)?.[1];
  const written = /^write_bytes:\s+(\d+)/m.exec(text)?.[1];
  return Number(read ?? 0) + Number(written ?? 0);
}

export function totalJiffiesOf(text: string): number {
  const end = text.indexOf('\n');
  const line = end === -1 ? text : text.slice(0, end);
  return line
    .trim()
    .split(/\s+/)
    .slice(1, 1 + JIFFY_FIELDS)
    .reduce((sum, field) => sum + Number(field), 0);
}

export function parsePasswd(text: string): Map<number, string> {
  const names = new Map<number, string>();
  for (const line of text.split('\n')) {
    const [name = '', , uid = ''] = line.split(':');
    if (name !== '' && uid !== '' && !names.has(Number(uid))) {
      names.set(Number(uid), name);
    }
  }
  return names;
}
