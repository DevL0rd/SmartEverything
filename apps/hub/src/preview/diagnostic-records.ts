import {
  ApiError,
  type PreviewConsoleRecord,
  type PreviewRecordRefusal,
  type PreviewLogPage,
  type PreviewDiagnosticScope,
  type PREVIEW_LOG_READ,
  type PREVIEW_LOG_SEARCH,
} from '@smarteverything/domain';
import type { z } from 'zod';
const RETAINED_BYTES = 1024 * 1024;
const RETAINED_RECORDS = 2000;
export class PreviewRecords {
  readonly records: PreviewConsoleRecord[] = [];
  private bytes = 0;
  private refusedRecords: readonly PreviewRecordRefusal[] = [];
  last = 0;
  omitted = 0;
  errors = 0;
  append(records: readonly PreviewConsoleRecord[]): void {
    for (const input of records) {
      if (input.id <= this.last) continue;
      this.omitted += Math.max(0, input.id - this.last - 1);
      this.last = input.id;
      const record = input;
      if (record.level === 'error') this.errors += 1;
      this.records.push(record);
      this.bytes += size(record);
      while (this.records.length > RETAINED_RECORDS || this.bytes > RETAINED_BYTES) {
        const oldest = this.records.shift();
        if (oldest === undefined)
          throw new ApiError('internal', 'Preview retention accounting failed.');
        this.bytes -= size(oldest);
        this.omitted += 1;
      }
    }
  }
  observe(
    lastRecordId: number | undefined,
    refusedRecords: readonly PreviewRecordRefusal[] | undefined,
  ): void {
    if (lastRecordId !== undefined && lastRecordId > this.last) {
      this.omitted += lastRecordId - this.last;
      this.last = lastRecordId;
    }
    if (refusedRecords !== undefined) this.refusedRecords = refusedRecords;
  }
  read(
    scope: PreviewDiagnosticScope,
    input: z.infer<typeof PREVIEW_LOG_READ>,
    shared: boolean,
    search?: z.infer<typeof PREVIEW_LOG_SEARCH>,
  ): PreviewLogPage {
    const snapshot = input.snapshot === undefined ? this.last : Math.min(input.snapshot, this.last);
    const retained = this.records.filter((record) => record.id <= snapshot);
    const matching =
      search === undefined ? retained : retained.filter((record) => matches(record, search));
    const pool = contextual(retained, matching, search);
    const candidates = pool.filter((record) => atCursor(record, input));
    const selected = pageRecords(candidates, input);
    const cursors = pageCursors(pool, selected);
    return {
      scope,
      records: selected,
      refusedRecords: this.refusedRecords.filter((entry) => entry.recordId <= snapshot),
      snapshot,
      ...cursors,
      omittedRecords: this.omitted,
      retainedFrom: retained.at(0)?.id ?? null,
      truncated: selected.length < candidates.length,
      matches: matching.length,
      errors: this.errors,
      delivery: shared ? 'shared' : 'none',
    };
  }
}
function size(record: PreviewConsoleRecord): number {
  return Buffer.byteLength(JSON.stringify(record));
}
function matches(record: PreviewConsoleRecord, input: z.infer<typeof PREVIEW_LOG_SEARCH>): boolean {
  const fields = [record.message, record.source, record.stack]
    .filter((value) => value !== null)
    .join('\n')
    .toLowerCase();
  return (
    fields.includes(input.text.toLowerCase()) &&
    (input.level === undefined || input.level === record.level) &&
    (input.source === undefined ||
      record.source?.toLowerCase().includes(input.source.toLowerCase()) === true) &&
    temporal(record, input)
  );
}
function contextual(
  records: readonly PreviewConsoleRecord[],
  matches: readonly PreviewConsoleRecord[],
  input: z.infer<typeof PREVIEW_LOG_SEARCH> | undefined,
): readonly PreviewConsoleRecord[] {
  if (input === undefined || input.before + input.after === 0) return matches;
  const ids = new Set(matches.map((record) => record.id));
  const selected = new Set<number>();
  records.forEach((record, index) => {
    if (ids.has(record.id))
      for (const adjacent of records.slice(
        Math.max(0, index - input.before),
        index + input.after + 1,
      ))
        selected.add(adjacent.id);
  });
  return records.filter((record) => selected.has(record.id));
}

function temporal(
  record: PreviewConsoleRecord,
  input: z.infer<typeof PREVIEW_LOG_SEARCH>,
): boolean {
  return (
    (input.afterTime === undefined || Date.parse(record.time) >= Date.parse(input.afterTime)) &&
    (input.beforeTime === undefined || Date.parse(record.time) <= Date.parse(input.beforeTime)) &&
    (input.firstId === undefined || record.id >= input.firstId) &&
    (input.lastId === undefined || record.id <= input.lastId)
  );
}
function atCursor(record: PreviewConsoleRecord, input: z.infer<typeof PREVIEW_LOG_READ>): boolean {
  return (
    input.cursor === undefined ||
    (input.direction === 'before' ? record.id < input.cursor : record.id > input.cursor)
  );
}
function pageRecords(
  candidates: readonly PreviewConsoleRecord[],
  input: z.infer<typeof PREVIEW_LOG_READ>,
): PreviewConsoleRecord[] {
  const order = input.direction === 'before' ? [...candidates].reverse() : candidates;
  const selected: PreviewConsoleRecord[] = [];
  let bytes = 0;
  for (const record of order) {
    if (selected.length >= input.limit || bytes + size(record) > input.byteLimit) break;
    selected.push(record);
    bytes += size(record);
  }
  if (selected.length === 0 && order.length > 0)
    throw new ApiError(
      'invalid_request',
      'The byte limit is too small for the next record; increase byteLimit to continue without losing it.',
    );
  return selected.sort((left, right) => left.id - right.id);
}
function pageCursors(
  pool: readonly PreviewConsoleRecord[],
  selected: readonly PreviewConsoleRecord[],
): Pick<PreviewLogPage, 'previousCursor' | 'nextCursor'> {
  const first = selected.at(0)?.id;
  const last = selected.at(-1)?.id;
  return {
    previousCursor: first !== undefined && pool.some((record) => record.id < first) ? first : null,
    nextCursor: last !== undefined && pool.some((record) => record.id > last) ? last : null,
  };
}
