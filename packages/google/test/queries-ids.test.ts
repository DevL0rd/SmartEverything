import { describe, expect, it } from 'vitest';
import {
  calendarListQuery,
  classifyApiFailure,
  classifyTokenFailure,
  deterministicEventId,
  eventsListQuery,
  isValidEventId,
  taskMoveQuery,
  tasksListQuery,
} from '../src';

function params(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe('events list query', () => {
  it('uses the same parameters for full and incremental lists', () => {
    const full = params(eventsListQuery({ calendarId: 'a@b.c' }));
    const incremental = params(eventsListQuery({ calendarId: 'a@b.c', syncToken: 'tok' }));
    incremental.delete('syncToken');
    expect([...incremental].sort()).toEqual([...full].sort());
    expect(full.has('timeMin')).toBe(false);
    expect(full.get('showDeleted')).toBe('true');
    expect(full.get('singleEvents')).toBe('false');
  });

  it('encodes the calendar id and carries the page token', () => {
    const url = eventsListQuery({ calendarId: 'a@b.c/x', pageToken: 'p' });
    expect(url).toContain('/calendars/a%40b.c%2Fx/events?');
    expect(params(url).get('pageToken')).toBe('p');
  });
});

describe('tasks and calendar list queries', () => {
  it('asks for deleted, hidden and completed tasks with updatedMin', () => {
    const query = params(
      tasksListQuery({ taskListId: 'l', updatedMin: '2026-01-01T00:00:00.000Z' }),
    );
    expect(query.get('showDeleted')).toBe('true');
    expect(query.get('showHidden')).toBe('true');
    expect(query.get('showCompleted')).toBe('true');
    expect(query.get('updatedMin')).toBe('2026-01-01T00:00:00.000Z');
  });

  it('lists deleted and hidden calendars and moves a task under a parent', () => {
    expect(params(calendarListQuery({ syncToken: 's' })).get('syncToken')).toBe('s');
    expect(params(calendarListQuery({})).get('showDeleted')).toBe('true');
    expect(params(taskMoveQuery('l', 't', { parent: 'p', previous: 'q' })).get('parent')).toBe('p');
  });
});

describe('deterministic event ids', () => {
  it('is stable, valid for Google and distinct per item and namespace', () => {
    const id = deterministicEventId('hub', 'item-1');
    expect(id).toBe(deterministicEventId('hub', 'item-1'));
    expect(id).toHaveLength(26);
    expect(isValidEventId(id)).toBe(true);
    expect(id).not.toBe(deterministicEventId('hub', 'item-2'));
    expect(id).not.toBe(deterministicEventId('other', 'item-1'));
  });

  it('rejects ids Google refuses', () => {
    expect(isValidEventId('ABC12')).toBe(false);
    expect(isValidEventId('abcw1')).toBe(false);
    expect(isValidEventId('abcd')).toBe(false);
  });
});

describe('failure classification', () => {
  it('maps the statuses the sync engines react to', () => {
    expect(classifyApiFailure(410, {}).kind).toBe('gone');
    expect(classifyApiFailure(412, {}).kind).toBe('precondition_failed');
    expect(classifyApiFailure(409, {}).kind).toBe('already_exists');
    expect(classifyApiFailure(404, {}).kind).toBe('not_found');
    expect(classifyApiFailure(401, {}).kind).toBe('unauthorized');
    expect(classifyApiFailure(503, {}).kind).toBe('unavailable');
  });

  it('treats 429 and usageLimits 403 as rate limiting but not a plain 403', () => {
    const usage = { error: { code: 403, message: 'm', errors: [{ reason: 'rateLimitExceeded' }] } };
    const denied = { error: { code: 403, message: 'm', errors: [{ reason: 'forbidden' }] } };
    expect(classifyApiFailure(429, {}).kind).toBe('rate_limited');
    expect(classifyApiFailure(403, usage)).toEqual({
      kind: 'rate_limited',
      reason: 'rateLimitExceeded',
    });
    expect(classifyApiFailure(403, denied).kind).toBe('rejected');
  });

  it('recognises invalid_grant on the token endpoint', () => {
    expect(classifyTokenFailure(400, { error: 'invalid_grant' }).kind).toBe('invalid_grant');
    expect(classifyTokenFailure(400, { error: 'invalid_client' }).kind).toBe('rejected');
  });
});
