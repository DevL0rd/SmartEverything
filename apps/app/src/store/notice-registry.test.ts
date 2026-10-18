import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { EntityStore } from './entity-store';
import { noticeHandler, noticeRouter, type LiveNotice } from './notice-registry';

const FIREWALL = {
  type: 'service_log',
  lines: ['one'],
} as const satisfies LiveNotice;

const TALK = {
  type: 'talk_floors',
  floors: [],
  online: [],
} as const satisfies LiveNotice;

function context(): { client: QueryClient; store: EntityStore } {
  return { client: new QueryClient(), store: new EntityStore() };
}

describe('noticeRouter', () => {
  it('hands a notice to the handler registered for its type, with the live flag', () => {
    const seen = vi.fn();
    const route = noticeRouter(
      [
        noticeHandler(['service_log'], (message, { live }) => {
          seen(message.lines, live);
        }),
      ],
      context(),
    );
    expect(route(FIREWALL, true)).toBe(true);
    expect(seen).toHaveBeenCalledWith(['one'], true);
  });

  it('reports a notice nobody registered as not handled', () => {
    const route = noticeRouter([noticeHandler(['service_log'], vi.fn())], context());
    expect(route(TALK, true)).toBe(false);
  });

  it('refuses two handlers for the same type', () => {
    expect(() =>
      noticeRouter(
        [noticeHandler(['service_log'], vi.fn()), noticeHandler(['service_log'], vi.fn())],
        context(),
      ),
    ).toThrow('service_log');
  });
});
