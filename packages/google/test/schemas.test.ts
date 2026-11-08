import { describe, expect, it } from 'vitest';
import {
  ApiErrorSchema,
  CalendarListSchema,
  EventsPageSchema,
  GoogleTaskSchema,
  TaskListsPageSchema,
  TokenResponseSchema,
  UserInfoSchema,
} from '../src';

describe('google payload schemas', () => {
  it('parses a token response and rejects one without an access token', () => {
    const ok = TokenResponseSchema.safeParse({
      access_token: 'a',
      expires_in: 3599,
      token_type: 'Bearer',
      scope: 'openid email',
      refresh_token: 'r',
    });
    expect(ok.success).toBe(true);
    expect(
      TokenResponseSchema.safeParse({ expires_in: 1, token_type: 'Bearer', scope: '' }).success,
    ).toBe(false);
  });

  it('keeps only modelled event fields', () => {
    const page = EventsPageSchema.parse({
      kind: 'calendar#events',
      items: [
        {
          id: 'e1',
          etag: '"1"',
          status: 'confirmed',
          unknownField: 1,
          start: { dateTime: '2026-11-07T10:00:00+07:00', timeZone: 'Asia/Bangkok' },
          reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] },
        },
      ],
      nextSyncToken: 'n',
    });
    expect(page.items[0]).not.toHaveProperty('unknownField');
    expect(page.items[0]?.reminders?.overrides?.[0]?.minutes).toBe(10);
  });

  it('rejects an event with an invalid status or reminder method', () => {
    expect(
      EventsPageSchema.safeParse({ items: [{ id: 'e', etag: 'x', status: 'gone' }] }).success,
    ).toBe(false);
    expect(
      EventsPageSchema.safeParse({
        items: [
          {
            id: 'e',
            etag: 'x',
            status: 'confirmed',
            reminders: { overrides: [{ method: 'sms', minutes: 1 }] },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('parses calendar lists, task lists, tasks, userinfo and errors', () => {
    expect(
      CalendarListSchema.parse({ items: [{ id: 'c', accessRole: 'reader', primary: true }] }).items,
    ).toHaveLength(1);
    expect(
      TaskListsPageSchema.parse({ items: [{ id: 'l', title: 'My tasks' }] }).items,
    ).toHaveLength(1);
    expect(
      GoogleTaskSchema.safeParse({
        id: 't',
        etag: 'e',
        status: 'needsAction',
        updated: '2026-01-01T00:00:00Z',
      }).success,
    ).toBe(true);
    expect(
      GoogleTaskSchema.safeParse({ id: 't', etag: 'e', status: 'done', updated: 'x' }).success,
    ).toBe(false);
    expect(UserInfoSchema.parse({ email: 'a@b.c', extra: 1 })).toEqual({ email: 'a@b.c' });
    expect(ApiErrorSchema.safeParse({ error: { code: 410, message: 'Gone' } }).success).toBe(true);
  });
});
