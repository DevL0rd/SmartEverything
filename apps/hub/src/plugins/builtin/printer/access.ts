import { PrinterError, problemsOf, type PrinterJob } from '@smarteverything/domain';
import type { ToolCaller } from '../contract';
import type { JobRecord } from './records';

export function isOwner(caller: ToolCaller): boolean {
  return caller.role === 'owner';
}

export function requireOwner(caller: ToolCaller, what: string): void {
  if (!isOwner(caller)) {
    throw new PrinterError('not_authorized', `Only the owner can ${what}.`);
  }
}

export function ownsJob(record: JobRecord, caller: ToolCaller): boolean {
  return record.origin === 'hub' && record.person === caller.profileId;
}

export function mayControl(record: JobRecord, caller: ToolCaller): boolean {
  return isOwner(caller) || ownsJob(record, caller);
}

function mineIn(record: JobRecord, caller: ToolCaller): boolean {
  return ownsJob(record, caller);
}

export function jobView(
  record: JobRecord,
  caller: ToolCaller,
  ahead: number | null = null,
): PrinterJob {
  const mine = mineIn(record, caller);
  const named = isOwner(caller) || mine;
  return {
    key: record.key,
    jobId: record.jobId,
    state: record.state,
    mine,
    origin: record.origin,
    name: named ? record.name : null,
    person: named ? record.person : null,
    pages: record.pages,
    pagesDone: null,
    sheets: record.sheets,
    color: record.color,
    mono: record.mono,
    duplex: record.sides === null ? null : record.sides.startsWith('two-sided'),
    copies: record.copies,
    format: record.format,
    createdAt: record.createdAt,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    reasons: record.reasons,
    cause: problemsOf(record.printerReasons, record.state === 'stopped')[0]?.title ?? null,
    message: record.message,
    ahead,
    progress: null,
  };
}
