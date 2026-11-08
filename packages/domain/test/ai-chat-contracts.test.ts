import { describe, expect, it } from 'vitest';
import { AI_CHAT_BRANCH, AI_CHAT_ROW, API_ENDPOINTS } from '../src';

const ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE = '22222222-2222-4222-8222-222222222222';
const AT = '2026-10-17T10:00:00.000Z';

const ROW = {
  id: ID,
  profile_id: ID,
  kind: 'chat',
  title: 'Trip',
  icon: null,
  parent_id: null,
  helper_name: null,
  source_key: null,
  engine: {
    kind: 'dsh',
    execution_target: { kind: 'server' },
    session_id: null,
    model_route_id: ID,
    model: 'vendor/model',
    effort: null,
  },
  tools: null,
  pinned: false,
  memory: true,
  archived_at: null,
  cost_micros: 0,
  context_percent: null,
  created_at: AT,
  updated_at: AT,
  last_message_at: null,
};

describe('the pending requests of a chat row', () => {
  it('is 0 for a row written before the field existed', () => {
    expect(AI_CHAT_ROW.parse(ROW).pending_requests).toBe(0);
  });

  it('keeps the count the hub sends', () => {
    expect(AI_CHAT_ROW.parse({ ...ROW, pending_requests: 3 }).pending_requests).toBe(3);
  });

  it('refuses a negative or fractional count', () => {
    expect(AI_CHAT_ROW.safeParse({ ...ROW, pending_requests: -1 }).success).toBe(false);
    expect(AI_CHAT_ROW.safeParse({ ...ROW, pending_requests: 1.5 }).success).toBe(false);
  });
});

describe('the display name of a helper chat', () => {
  it('allows named helpers and rejects a name on normal chats', () => {
    expect(AI_CHAT_ROW.parse(ROW).helper_name).toBeNull();
    expect(AI_CHAT_ROW.parse({ ...ROW, kind: 'subagent', helper_name: 'Nova' }).helper_name).toBe(
      'Nova',
    );
    expect(AI_CHAT_ROW.safeParse({ ...ROW, helper_name: 'Nova' }).success).toBe(false);
    expect(AI_CHAT_ROW.parse({ ...ROW, kind: 'subagent' }).helper_name).toBeNull();
  });

  it('accepts an older row without a name and rejects a blank label', () => {
    expect(AI_CHAT_ROW.parse({ ...ROW, helper_name: undefined }).helper_name).toBeNull();
    expect(AI_CHAT_ROW.safeParse({ ...ROW, kind: 'subagent', helper_name: ' ' }).success).toBe(
      false,
    );
  });
});

describe('branching with another engine', () => {
  it('leaves the engine out by default', () => {
    expect(AI_CHAT_BRANCH.parse({ messageId: MESSAGE }).engine).toBeUndefined();
  });

  it('accepts a model and thinking level for the branch and leaves the route to the hub', () => {
    const body = AI_CHAT_BRANCH.parse({
      messageId: MESSAGE,
      engine: { kind: 'dsh', model: 'anthropic/claude-sonnet', effort: 'high' },
    });
    expect(body.engine).toEqual({
      kind: 'dsh',
      execution_target: { kind: 'server' },
      session_id: null,
      model_route_id: null,
      model: 'anthropic/claude-sonnet',
      effort: 'high',
      permission: { sandbox: 'danger-full-access', approval: 'never' },
    });
  });

  it('accepts a bare dsh engine as the hub default model on the owner’s route', () => {
    const body = AI_CHAT_BRANCH.parse({ messageId: MESSAGE, engine: { kind: 'dsh' } });
    expect(body.engine).toMatchObject({ kind: 'dsh', model_route_id: null, model: null });
  });

  it('refuses a named route without the model that runs on it', () => {
    expect(
      AI_CHAT_BRANCH.safeParse({ messageId: MESSAGE, engine: { kind: 'dsh', model_route_id: ID } })
        .success,
    ).toBe(false);
  });

  it('refuses the removed openrouter engine kind', () => {
    expect(
      AI_CHAT_BRANCH.safeParse({ messageId: MESSAGE, engine: { kind: 'openrouter', model: null } })
        .success,
    ).toBe(false);
  });

  it('refuses an engine of an unknown kind', () => {
    expect(
      AI_CHAT_BRANCH.safeParse({ messageId: MESSAGE, engine: { kind: 'unknown' } }).success,
    ).toBe(false);
  });
});

describe('listing and clearing chats', () => {
  const list = API_ENDPOINTS.listAiChats.query;
  const clear = API_ENDPOINTS.clearAiChats.query;

  it('pages archived chats from a cursor with a page size', () => {
    expect(list.parse({ archived: 'true', before: ID, limit: '20' })).toMatchObject({
      archived: true,
      before: ID,
      limit: 20,
    });
  });

  it('lists every chat when no page size is given', () => {
    expect(list.parse({}).limit).toBeUndefined();
  });

  it('refuses a page size below 1 and a cursor that is not a chat id', () => {
    expect(list.safeParse({ limit: '0' }).success).toBe(false);
    expect(list.safeParse({ before: 'latest' }).success).toBe(false);
  });

  it('clears history only when the profile scope is named', () => {
    expect(clear.safeParse({ scope: 'profile' }).success).toBe(true);
    expect(clear.safeParse({}).success).toBe(false);
    expect(clear.safeParse({ scope: 'all' }).success).toBe(false);
  });

  it('lets a member clear their own profile', () => {
    expect(API_ENDPOINTS.clearAiChats.access).toBe('member');
  });
});
