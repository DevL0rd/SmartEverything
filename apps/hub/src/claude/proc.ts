import { readFileSync, readlinkSync } from 'node:fs';
import { ClaudeProcReadError } from './errors';

const STAT_FIRST_FIELD_AFTER_NAME = 3;
const STAT_START_TIME_FIELD = 22;

function isGone(cause: unknown): boolean {
  return (
    cause instanceof Error && 'code' in cause && (cause.code === 'ENOENT' || cause.code === 'ESRCH')
  );
}

function startTimeOf(stat: string, path: string): string {
  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  const start = fields[STAT_START_TIME_FIELD - STAT_FIRST_FIELD_AFTER_NAME];
  if (start === undefined || start === '') {
    throw new ClaudeProcReadError(path, 'the stat line has no start time field');
  }
  return start;
}

export function processStart(pid: number): string | null {
  const path = `/proc/${String(pid)}/stat`;
  let stat: string;
  try {
    stat = readFileSync(path, 'utf8');
  } catch (cause) {
    if (isGone(cause)) {
      return null;
    }
    throw new ClaudeProcReadError(path, cause instanceof Error ? cause.message : String(cause));
  }
  return startTimeOf(stat, path);
}

export function pidNamespace(): string {
  const path = '/proc/self/ns/pid';
  try {
    return readlinkSync(path);
  } catch (cause) {
    throw new ClaudeProcReadError(path, cause instanceof Error ? cause.message : String(cause));
  }
}
