import { describe, expect, it, vi } from 'vitest';
import {
  AI_MODEL_ROUTE,
  DSH_ENGINE,
  type AiModelRoute,
  type Engine,
} from '@smarteverything/domain';
import {
  KEY_NEEDED_STATUS,
  MACHINE_UNAVAILABLE_NOTICE,
  draftNeedsChat,
  draftStatusOf,
  engineUsesOpenRouter,
  sendFailureNotice,
  startChatWithMessage,
  createDraftChatStarter,
  type StartSteps,
} from './draft-chat-request';

const OPENROUTER: Engine = DSH_ENGINE.parse({
  kind: 'dsh',
  execution_target: { kind: 'server' },
  session_id: null,
  model_route_id: '11111111-1111-4111-8111-111111111111',
  model: 'm',
});

describe('a new chat draft asking for a started chat', () => {
  it('does for a slash command on an own engine', () => {
    expect(draftNeedsChat(OPENROUTER, '/comp')).toBe(true);
    expect(draftNeedsChat(OPENROUTER, '/')).toBe(true);
  });

  it('does for an @ that starts a word', () => {
    expect(draftNeedsChat(OPENROUTER, 'ask @Anna about it')).toBe(true);
  });

  it('does not for plain text or an @ inside a word', () => {
    expect(draftNeedsChat(OPENROUTER, 'write to anna@example.com')).toBe(false);
    expect(draftNeedsChat(OPENROUTER, 'hello there')).toBe(false);
  });

  it('does not while the engine is unresolved', () => {
    expect(draftNeedsChat(null, '/comp')).toBe(false);
  });

  it('does not for a native engine that has no chat-bound commands', () => {
    const native: Engine = {
      kind: 'codex',
      device_id: 'd',
      model: 'm',
      effort: null,
      settings: {},
    };
    expect(draftNeedsChat(native, '/comp')).toBe(false);
  });

  it('does for an @ on a Claude computer, which mentions files of a started chat', () => {
    const claude: Engine = {
      kind: 'claude',
      device_id: 'd',
      model: 'm',
      effort: null,
      settings: { builtin_tools: [] },
    };
    expect(draftNeedsChat(claude, 'read @src/app.ts')).toBe(true);
    expect(draftNeedsChat(claude, '/comp')).toBe(false);
  });
});

describe('draft status line', () => {
  const idle = { loading: false, runtimeStopped: false, needsKey: false, blocked: null };

  it('is empty when the draft can send', () => {
    expect(draftStatusOf(idle)).toBeNull();
  });

  it('says the real cause in order of importance', () => {
    const all = { loading: true, runtimeStopped: true, needsKey: true, blocked: 'offline' };
    expect(draftStatusOf(all)).toBe('This computer’s runtime isn’t running');
    expect(draftStatusOf({ ...all, runtimeStopped: false })).toBe(
      'Loading the model for new chats…',
    );
    expect(draftStatusOf({ ...all, runtimeStopped: false, loading: false })).toBe(
      KEY_NEEDED_STATUS,
    );
    expect(draftStatusOf({ ...idle, blocked: 'Workstation is offline.' })).toBe(
      'Workstation is offline.',
    );
  });
});

describe('which engines need the OpenRouter key', () => {
  it('does not for a native computer engine', () => {
    const native: Engine = {
      kind: 'claude',
      device_id: 'd',
      model: 'm',
      effort: null,
      settings: { builtin_tools: [] },
    };
    expect(engineUsesOpenRouter(native, [])).toBe(false);
  });

  it('follows the auth provider of the route a harness engine runs on', () => {
    const ROUTE_ID = '11111111-1111-4111-8111-111111111111';
    const route = (provider: 'openrouter' | 'anthropic'): AiModelRoute =>
      AI_MODEL_ROUTE.parse({
        id: ROUTE_ID,
        profile_id: '22222222-2222-4222-8222-222222222222',
        supplier: { kind: 'server' },
        subscriber_id: 's',
        auth:
          provider === 'openrouter'
            ? { provider, kind: 'hub-api-key' }
            : { provider, kind: 'claude-subscription-oauth' },
        billing: provider === 'openrouter' ? 'metered' : 'subscription-only',
        fallback: 'none',
        background_authorized: false,
        capability_revision: 'r',
        models: [],
        state: 'ready',
      });
    const harness = DSH_ENGINE.parse({
      kind: 'dsh',
      execution_target: { kind: 'server' },
      session_id: null,
      model_route_id: ROUTE_ID,
      model: 'm',
    });
    expect(engineUsesOpenRouter(harness, [route('openrouter')])).toBe(true);
    expect(engineUsesOpenRouter(harness, [route('anthropic')])).toBe(false);
    expect(engineUsesOpenRouter(harness, [])).toBe(false);
  });
});

describe('starting a chat with its first message', () => {
  function steps(overrides: {
    create?: () => Promise<{ id: string }>;
    send?: () => Promise<unknown>;
  }): StartSteps {
    return {
      create: overrides.create ?? vi.fn(() => Promise.resolve({ id: 'chat-1' })),
      send: overrides.send ?? vi.fn(() => Promise.resolve(null)),
      chatId: null,
      created: vi.fn(),
    };
  }

  it('opens the created chat once the message is sent', async () => {
    const run = steps({});
    expect(await startChatWithMessage(run)).toEqual({ kind: 'sent', chatId: 'chat-1' });
    expect(run.send).toHaveBeenCalledWith('chat-1');
    expect(run.created).toHaveBeenCalledWith('chat-1');
  });

  it('preserves the created chat identity when the send acknowledgement is lost', async () => {
    const cause = new Error('no answer');
    const run = steps({ send: () => Promise.reject(cause) });
    expect(await startChatWithMessage(run)).toEqual({
      kind: 'failed',
      stage: 'send',
      cause,
      chatId: 'chat-1',
    });
    expect(run.created).toHaveBeenCalledWith('chat-1');
  });

  it('has nothing to delete when the chat was never created', async () => {
    const cause = new Error('offline');
    const run = steps({ create: () => Promise.reject(cause) });
    expect(await startChatWithMessage(run)).toEqual({ kind: 'failed', stage: 'create', cause });
    expect(run.send).not.toHaveBeenCalled();
    expect(run.created).not.toHaveBeenCalled();
  });

  it('shares overlapping submissions of the same first-message request', async () => {
    const start = createDraftChatStarter();
    let finishCreate = (_chat: { id: string }): void => {
      throw new Error('Expected a pending chat creation');
    };
    const created = new Promise<{ id: string }>((resolve) => {
      finishCreate = resolve;
    });
    const run = steps({ create: vi.fn(() => created) });
    const first = start('request-1', run);
    const second = start('request-1', run);
    expect(first).toBe(second);
    expect(run.create).toHaveBeenCalledTimes(1);
    finishCreate({ id: 'chat-1' });
    expect(await first).toEqual({ kind: 'sent', chatId: 'chat-1' });
    expect(run.send).toHaveBeenCalledTimes(1);
  });

  it('keeps an explicit retry on its original chat without replaying automatically', async () => {
    const start = createDraftChatStarter();
    const cause = new Error('acknowledgement lost');
    const run = steps({ send: vi.fn(() => Promise.reject(cause)) });
    await start('request-1', run);
    expect(run.send).toHaveBeenCalledTimes(1);
    const retry = { ...steps({}), chatId: 'chat-1' };
    expect(await start('request-1', retry)).toEqual({ kind: 'sent', chatId: 'chat-1' });
    expect(retry.create).not.toHaveBeenCalled();
    expect(retry.send).toHaveBeenCalledExactlyOnceWith('chat-1');
  });

  it('tells the person their message is still there', () => {
    expect(sendFailureNotice('Home Hub')).toBe(
      'Couldn’t send. Home Hub didn’t answer. Your message is still here.',
    );
    expect(MACHINE_UNAVAILABLE_NOTICE).toContain('Your message is still here.');
  });
});
