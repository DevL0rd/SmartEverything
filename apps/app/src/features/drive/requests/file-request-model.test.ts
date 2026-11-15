import { describe, expect, it } from 'vitest';
import { bytes } from '../../../format/number';
import { DAY_MS } from '../../../format/time';
import {
  FOLDER_ID,
  OTHER_ROW_ID,
  OWNER_ID,
  MEMBER_ID,
  documentFixture,
  fileRequestRow,
  folderFixture,
} from '../data/fixtures';
import {
  bytesShareOf,
  changeBodyOf,
  closeQuestionOf,
  createBodyOf,
  draftReadyOf,
  editDraftOf,
  fileRequestAllowedOf,
  fileRequestGroupsOf,
  LINK_SHOWN_ONCE_LINE,
  newDraftOf,
  REQUESTS_LINK_LINE,
  receivedLineOf,
  requestEndOptionsOf,
  requestStateOf,
  stateLineOf,
} from './file-request-model';

const NOW = Date.parse('2026-11-07T12:00:00.000Z');

describe('the file request form', () => {
  it('starts with a title from the folder and no end', () => {
    expect(newDraftOf('Taxes')).toEqual({ title: 'Files for Taxes', message: '', end: 'never' });
    expect(draftReadyOf({ title: '  ', message: '', end: 'never' })).toBe(false);
  });

  it('builds the request body with a trimmed title, no empty message and the chosen end', () => {
    const now = Date.now();
    expect(
      createBodyOf(FOLDER_ID, { title: ' Receipts ', message: ' ', end: 'week' }, now),
    ).toEqual({
      folderItemId: FOLDER_ID,
      title: 'Receipts',
      message: null,
      expiresAt: new Date(now + 7 * DAY_MS).toISOString(),
    });
    expect(createBodyOf(FOLDER_ID, { title: '', message: '', end: 'never' }, now)).toBeNull();
  });

  it('changes only what was edited and keeps the end unless a new one is picked', () => {
    const request = fileRequestRow({ title: 'Receipts', message: 'Photos are fine' });
    const draft = editDraftOf(request);
    expect(draft.end).toBe('keep');
    expect(changeBodyOf(request, draft, Date.now())).toBeNull();
    expect(changeBodyOf(request, { ...draft, title: 'All receipts' }, Date.now())).toEqual({
      title: 'All receipts',
    });
    expect(changeBodyOf(request, { ...draft, message: '' }, Date.now())).toEqual({ message: null });
    expect(changeBodyOf(request, { ...draft, end: 'never' }, Date.now())).toEqual({
      expiresAt: null,
    });
  });

  it('offers to keep the current end only when editing', () => {
    expect(requestEndOptionsOf(null, NOW).map((option) => option.value)).toEqual([
      'never',
      'day',
      'week',
      'month',
    ]);
    const editing = fileRequestRow({ expiresAt: new Date(NOW + 3 * DAY_MS).toISOString() });
    expect(requestEndOptionsOf(editing, NOW)[0]?.label).toMatch(/^Keep: .* · Ends in 3 days$/);
    expect(requestEndOptionsOf(fileRequestRow(), NOW)[0]?.label).toBe('Keep: no end');
  });

  it('allows a request only on a folder the person may make links for', () => {
    const folder = folderFixture();
    expect(fileRequestAllowedOf(folder, 'own', false, { membersMayShare: true })).toBe(true);
    expect(fileRequestAllowedOf(folder, 'own', false, { membersMayShare: false })).toBe(false);
    expect(fileRequestAllowedOf(folder, 'own', true, { membersMayShare: false })).toBe(true);
    expect(fileRequestAllowedOf(folder, 'shared', false, { membersMayShare: true })).toBe(true);
    expect(fileRequestAllowedOf(folder, 'edit', true, { membersMayShare: true })).toBe(false);
    expect(fileRequestAllowedOf(documentFixture(), 'own', true, null)).toBe(false);
  });
});

describe('file request cards', () => {
  it('tells open, closed and ended requests apart', () => {
    expect(requestStateOf(fileRequestRow(), NOW)).toBe('open');
    expect(requestStateOf(fileRequestRow({ closedAt: '2026-11-06T09:00:00.000Z' }), NOW)).toBe(
      'closed',
    );
    expect(requestStateOf(fileRequestRow({ expiresAt: '2026-11-06T09:00:00.000Z' }), NOW)).toBe(
      'expired',
    );
    expect(stateLineOf(fileRequestRow({ closedAt: '2026-11-06T09:00:00.000Z' }), NOW)).toMatch(
      /^Closed /,
    );
    expect(stateLineOf(fileRequestRow({ expiresAt: '2026-11-06T09:00:00.000Z' }), NOW)).toMatch(
      /^Ended /,
    );
    expect(stateLineOf(fileRequestRow(), NOW)).toBe('No end');
  });

  it('counts what arrived and sizes the bar against the largest request', () => {
    const big = fileRequestRow({ uploads: 14, bytes: 200 * 1024 ** 2 });
    const small = fileRequestRow({ id: OTHER_ROW_ID, uploads: 3, bytes: 50 * 1024 ** 2 });
    expect(receivedLineOf(fileRequestRow())).toBe('Nothing received yet');
    expect(receivedLineOf(big)).toBe(`14 files · ${bytes(200 * 1024 ** 2)}`);
    expect(bytesShareOf(small, [big, small])).toBeCloseTo(0.25);
    expect(bytesShareOf(fileRequestRow(), [fileRequestRow()])).toBe(0);
  });

  it('shows the viewer’s own requests, newest first, open ones apart from ended ones', () => {
    const open = fileRequestRow({ createdAt: '2026-11-06T09:00:00.000Z' });
    const closed = fileRequestRow({ id: OTHER_ROW_ID, closedAt: '2026-11-06T10:00:00.000Z' });
    const theirs = fileRequestRow({
      id: 'a1b2c3d4-0000-4000-8000-000000000999',
      createdBy: MEMBER_ID,
    });
    expect(fileRequestGroupsOf([open, closed, theirs], OWNER_ID, NOW)).toEqual({
      open: [open],
      ended: [closed],
    });
  });

  it('asks before closing and says the files stay', () => {
    expect(closeQuestionOf('Receipts')).toMatchObject({
      title: 'Close Receipts?',
      confirmLabel: 'Close request',
      tone: 'destructive',
    });
  });

  it('says the upload link is shown once and how to get another', () => {
    expect(LINK_SHOWN_ONCE_LINE).toMatch(/shown this once/);
    expect(REQUESTS_LINK_LINE).toMatch(/close the request and make another/);
  });
});
