import { describe, expect, it } from 'vitest';
import type { UploadEntry } from '../../nas/uploads';
import {
  dropDetail,
  dropTitle,
  failureLineOf,
  failureText,
  headlineOf,
  identityOf,
  leftText,
  nextClock,
  retryNoticeOf,
  rowsOf,
  stateOf,
  summaryOf,
  type UploadRecord,
} from './upload-model';

const FOLDER = 'folder-1';

function entry(id: string, patch: Partial<UploadEntry> = {}): UploadEntry {
  return { id, name: `${id}.pdf`, size: 100, sent: 0, state: 'uploading', outcome: null, ...patch };
}

function record(key: string, handleId: string | null, folderId = FOLDER): UploadRecord {
  return { key, folderId, name: `${key}.pdf`, size: 100, handleId };
}

describe('upload model', () => {
  it('maps every hub refusal to a plain sentence', () => {
    expect(failureText({ kind: 'over-quota' })).toMatch(/Drive space is full/);
    expect(failureText({ kind: 'no-space' })).toMatch(/disk is full/);
    expect(failureText({ kind: 'read-only-root' })).toMatch(/read-only/);
    expect(failureText({ kind: 'rejected', status: 422, message: 'Bad name.' })).toBe('Bad name.');
  });

  it('marks only connection and expiry failures as worth trying again', () => {
    const failed = (kind: 'hub-unreachable' | 'over-quota'): UploadEntry =>
      entry('a', {
        state: 'settled',
        outcome: {
          kind: 'failed',
          failure: kind === 'over-quota' ? { kind } : { kind, reason: 'offline' },
        },
      });
    expect(stateOf(failed('hub-unreachable'))).toMatchObject({ retryable: true });
    expect(stateOf(failed('over-quota'))).toMatchObject({ retryable: false });
  });

  it('keeps rows of one folder, waiting rows before a handle exists', () => {
    const records = [record('a', 'h1'), record('b', null), record('c', 'h3', 'other')];
    const rows = rowsOf(records, [entry('h1', { sent: 50 }), entry('h3')], FOLDER);
    expect(rows.map((row) => row.state.kind)).toEqual(['sending', 'waiting']);
    expect(summaryOf(rows)).toMatchObject({ total: 2, sent: 50, size: 200, waiting: 1 });
  });

  it('writes the headline from the counts', () => {
    const rows = rowsOf(
      [record('a', 'h1'), record('b', 'h2')],
      [
        entry('h1', {
          state: 'settled',
          outcome: { kind: 'failed', failure: { kind: 'no-space' } },
        }),
        entry('h2', {
          state: 'settled',
          sent: 100,
          outcome: { kind: 'done', itemId: 'i', name: 'b.pdf', renamed: false },
        }),
      ],
      FOLDER,
    );
    expect(headlineOf(summaryOf(rows), 'Taxes')).toBe('Uploaded 1 of 2 · 1 didn’t upload');
  });

  it('times the rate from the first sending sample and resets when nothing moves', () => {
    const start = nextClock(undefined, true, 0, 0);
    expect(start).toEqual({ startAt: 0, startSent: 0, rate: null });
    expect(nextClock(start, true, 3000, 1500)?.rate).toBe(2000);
    expect(nextClock(start, false, 3000, 1500)).toBeUndefined();
    const big = { ...record('a', 'h1'), size: 240_000 };
    const summary = summaryOf(rowsOf([big], [entry('h1', { size: 240_000 })], FOLDER));
    expect(leftText(summary, 1000)).toBe('4 min left');
    expect(leftText(summary, null)).toBeNull();
  });

  it('says how far a dropped connection got and gathers those rows into one notice', () => {
    const rows = rowsOf(
      [record('a', 'h1'), record('b', 'h2')],
      [
        entry('h1', {
          state: 'settled',
          sent: 62,
          outcome: { kind: 'failed', failure: { kind: 'hub-unreachable', reason: 'offline' } },
        }),
        entry('h2', {
          state: 'settled',
          outcome: { kind: 'failed', failure: { kind: 'over-quota' } },
        }),
      ],
      FOLDER,
    );
    const [lost, full] = rows;
    expect(lost === undefined ? null : failureLineOf(lost)).toBe('Failed at 62 %');
    expect(full === undefined ? null : failureLineOf(full)).toMatch(/Drive space is full/);
    expect(retryNoticeOf(rows)?.title).toBe('1 upload failed');
    expect(retryNoticeOf(rows.slice(1))).toBeNull();
  });

  it('keys a resumable upload by folder, name and modified time', () => {
    expect(identityOf('Lease.pdf', 'f1', 1700)).toBe('drive-upload:f1:Lease.pdf:1700');
    expect(identityOf('Lease.pdf', 'f2', null)).toBe('drive-upload:f2:Lease.pdf:');
  });

  it('says where a drop goes and that nothing is replaced', () => {
    expect(dropTitle('Home papers')).toBe('Drop to upload into Home papers');
    expect(dropDetail(0)).toBe('Names that already exist get a number, nothing is replaced');
    expect(dropDetail(3)).toBe(
      'Names that already exist get a number, nothing is replaced · Synced to 3 computers after upload',
    );
  });
});
