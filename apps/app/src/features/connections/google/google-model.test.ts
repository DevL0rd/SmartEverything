import { describe, expect, it } from 'vitest';
import type {
  GoogleAccountRow,
  GoogleSyncLogEntry,
  PlannerCollectionRow,
} from '@smarteverything/domain';
import { draftReady, setupSteps, trimmedDraft } from './google-app-setup';
import { calendarChoices, calendarIdsWith, syncedLists } from './google-choices';
import { logLine, weekSummary } from './google-log';
import { problemText, serviceRows, statusText } from './google-status';

const ME = '00000000-0000-4000-8000-000000000001';
const ALEX = '00000000-0000-4000-8000-000000000002';
const SAM = '00000000-0000-4000-8000-000000000003';

const PEOPLE = [
  { id: SAM, name: 'Sam', colour: 'aqua' },
  { id: ALEX, name: 'Alex', colour: 'ice' },
  { id: ME, name: 'Pat', colour: 'violet' },
] as const;

function account(patch: Partial<GoogleAccountRow> = {}): GoogleAccountRow {
  return {
    profile_id: ME,
    email: 'me@example.com',
    scopes: [],
    status: 'linked',
    problem: null,
    calendar_ids: [],
    list_ids: [],
    last_sync_at: null,
    last_error: null,
    ...patch,
  };
}

function entry(patch: Partial<GoogleSyncLogEntry> = {}): GoogleSyncLogEntry {
  return {
    id: '00000000-0000-4000-8000-0000000000aa',
    profile_id: ME,
    at: '2026-11-14T10:00:00.000Z',
    trigger: 'manual',
    product: null,
    counts: { pulled: 0, created: 0, updated: 0, deleted: 0, pushed: 0, conflicts: 0 },
    conflicts: [],
    error: null,
    choice: null,
    ...patch,
  };
}

function collection(
  name: string,
  kind: PlannerCollectionRow['kind'],
  googleId: string | null,
): PlannerCollectionRow {
  return {
    id: `00000000-0000-4000-8000-${String(name.length).padStart(12, '0')}`,
    profile_id: ME,
    kind,
    name,
    colour: 'work',
    icon: kind,
    position: 0,
    visible: true,
    default_reminders: [],
    source: googleId === null ? 'local' : 'google',
    google: googleId === null ? null : { id: googleId, etag: null, syncToken: null },
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
  };
}

describe('Google service rows', () => {
  it('shows the owner every person, themselves first and the rest by name', () => {
    const rows = serviceRows(
      PEOPLE,
      [
        account(),
        account({ profile_id: ALEX, status: 'needs_attention', problem: 'invalid_grant' }),
      ],
      ME,
      true,
    );
    expect(rows.map((row) => row.who)).toEqual(['You', 'Alex', 'Sam']);
    expect(rows[0]?.text).toBe('Linked as me@example.com');
    expect(rows[1]?.text).toBe('Needs attention · Google signed Alex out');
    expect(rows[1]?.critical).toBe(true);
    expect(rows[2]?.text).toBe('Not linked');
    expect(rows[2]?.dot).toBeNull();
  });

  it('shows a member only their own row', () => {
    const rows = serviceRows(PEOPLE, [account({ profile_id: ALEX })], ALEX, false);
    expect(rows.map((row) => row.person.id)).toEqual([ALEX]);
    expect(rows[0]?.who).toBe('You');
  });

  it('adds the sync time to a linked account', () => {
    expect(statusText(account({ last_sync_at: '2026-11-14T14:02:00.000Z' }), 'you')).toMatch(
      /^Linked as me@example\.com · synced \S+/,
    );
  });

  it('names who Google signed out', () => {
    expect(problemText('invalid_grant', 'you').title).toBe('Google signed you out');
    expect(problemText(null, 'you').title).toBe('Google needs attention');
  });
});

describe('Google sync log lines', () => {
  it('describes pulled and pushed changes', () => {
    const counts = { pulled: 2, created: 0, updated: 2, deleted: 0, pushed: 1, conflicts: 0 };
    expect(logLine(entry({ counts })).text).toBe('Pulled 2 changes, pushed 1');
    expect(logLine(entry()).text).toBe('Nothing changed');
  });

  it('puts a failure and an open choice ahead of the counts', () => {
    expect(logLine(entry({ error: 'network' }))).toMatchObject({
      text: 'Sync failed: network',
      tone: 'critical',
    });
    const choice = {
      item_id: ME,
      list_id: 'list',
      candidates: [
        { google_id: 'a', title: 'Milk', created_at: '2026-11-14T10:00:00.000Z' },
        { google_id: 'b', title: 'Milk', created_at: '2026-11-14T10:01:00.000Z' },
      ],
      resolved_google_id: null,
      resolved_at: null,
    };
    expect(logLine(entry({ choice })).tone).toBe('warning');
  });

  it('says which side won a conflict', () => {
    const conflicts = [
      { item_id: ME, field: 'start', winner: 'google' as const, losing_value: '15:00' },
    ];
    expect(logLine(entry({ conflicts })).text).toMatch(/kept the Google version/);
  });

  it('adds up the changes of the last seven days per day', () => {
    const now = Date.parse('2026-11-14T12:00:00.000Z');
    const counts = { pulled: 3, created: 0, updated: 0, deleted: 0, pushed: 1, conflicts: 0 };
    const week = weekSummary(
      [
        entry({ counts, at: '2026-11-14T09:00:00.000Z' }),
        entry({ counts, at: '2026-11-13T09:00:00.000Z' }),
        entry({ counts, at: '2026-10-01T09:00:00.000Z' }),
      ],
      now,
    );
    expect(week.days).toHaveLength(7);
    expect(week.changes).toBe(8);
    expect(week.days.at(-1)?.key).toBe(week.today);
    expect(week.days.at(-1)?.value).toBe(4);
  });
});

describe('Google sync choices', () => {
  it('offers each mirrored calendar and keeps chosen ones waiting for their first sync', () => {
    const row = account({ calendar_ids: ['work@google', 'new@google'] });
    const choices = calendarChoices(row, [
      collection('Work', 'calendar', 'work@google'),
      collection('Holidays', 'calendar', 'holidays@google'),
      collection('Local', 'calendar', null),
    ]);
    expect(choices).toEqual([
      { googleId: 'holidays@google', name: 'Holidays', on: false },
      { googleId: 'work@google', name: 'Work', on: true },
      { googleId: 'new@google', name: 'new@google', on: true },
    ]);
  });

  it('lists the Google task lists that sync', () => {
    expect(syncedLists(account(), [collection('Shopping', 'list', 'shop')])).toEqual([
      { googleId: 'shop', name: 'Shopping' },
    ]);
  });

  it('turns a calendar on and off without touching the others', () => {
    const row = account({ calendar_ids: ['a', 'b'] });
    expect(calendarIdsWith(row, 'c', true)).toEqual(['a', 'b', 'c']);
    expect(calendarIdsWith(row, 'a', false)).toEqual(['b']);
  });
});

describe('Your Google app', () => {
  it('needs every field before it can be saved', () => {
    expect(
      draftReady({ androidClientId: 'a', desktopClientId: 'b', desktopClientSecret: ' ' }),
    ).toBe(false);
    expect(
      trimmedDraft({ androidClientId: ' a ', desktopClientId: 'b', desktopClientSecret: 'c' }),
    ).toEqual({ androidClientId: 'a', desktopClientId: 'b', desktopClientSecret: 'c' });
  });

  it('names the package in the setup steps', () => {
    expect(setupSteps('com.example.app')).toContain('package name com.example.app');
  });
});
