import { describe, expect, it, vi } from 'vitest';
import {
  AI_MODEL_ROUTE,
  DEFAULT_ENGINE,
  DSH_ENGINE,
  type AiModelRoute,
  type Engine,
} from '@smarteverything/domain';
import {
  KEY_NEEDED_STATUS,
  MACHINE_UNAVAILABLE_NOTICE,
  draftNeedsChat,
  draftStatusOf,
  draftSuggestions,
  engineUsesOpenRouter,
  runLineOf,
  sendFailureNotice,
  startChatWithMessage,
  type StartSteps,
} from './draft-chat-request';

const OPENROUTER = DEFAULT_ENGINE;

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

const HOME = { climate: true, health: true, cameras: true, computer: false };

describe('draft suggestions', () => {
  it('offers four home suggestions on the hub', () => {
    expect(draftSuggestions(HOME)).toEqual([
      'How’s the air at home?',
      'Dim the living room at sunset',
      'What did the door camera see today?',
      'What can you do?',
    ]);
  });

  it('puts one computer suggestion first and keeps four', () => {
    const list = draftSuggestions({ ...HOME, computer: true });
    expect(list).toEqual([
      'Summarise what changed in ~/repo today',
      'How’s the air at home?',
      'Dim the living room at sunset',
      'What can you do?',
    ]);
  });

  it('swaps what the home cannot answer for something it can', () => {
    const bare = draftSuggestions({
      climate: false,
      health: false,
      cameras: false,
      computer: false,
    });
    expect(bare).toEqual([
      'What’s on at home right now?',
      'Dim the living room at sunset',
      'Make a bedtime routine',
      'What can you do?',
    ]);
    expect(draftSuggestions({ ...HOME, cameras: false })[2]).toBe('Log my dinner');
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
    expect(draftStatusOf({ ...all, runtimeStopped: false })).toBe('Loading your default model…');
    expect(draftStatusOf({ ...all, runtimeStopped: false, loading: false })).toBe(
      KEY_NEEDED_STATUS,
    );
    expect(draftStatusOf({ ...idle, blocked: 'Workstation is offline.' })).toBe(
      'Workstation is offline.',
    );
  });
});

describe('run line', () => {
  it('names the machine and the access when there is one', () => {
    expect(runLineOf('Workstation', 'Allow edits')).toBe('Running on Workstation · Allow edits');
    expect(runLineOf('Home Hub', null)).toBe('Running on Home Hub');
  });
});

describe('which engines need the OpenRouter key', () => {
  it('needs it for the cloud engine only when no route says otherwise', () => {
    expect(engineUsesOpenRouter(OPENROUTER, [])).toBe(true);
  });

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
      remove: vi.fn(() => Promise.resolve()),
    };
  }

  it('opens the created chat once the message is sent', async () => {
    const run = steps({});
    expect(await startChatWithMessage(run)).toEqual({ kind: 'sent', chatId: 'chat-1' });
    expect(run.send).toHaveBeenCalledWith('chat-1');
    expect(run.remove).not.toHaveBeenCalled();
  });

  it('deletes the empty chat when the send fails so the draft can come back', async () => {
    const cause = new Error('no answer');
    const run = steps({ send: () => Promise.reject(cause) });
    expect(await startChatWithMessage(run)).toEqual({ kind: 'failed', stage: 'send', cause });
    expect(run.remove).toHaveBeenCalledWith('chat-1');
  });

  it('has nothing to delete when the chat was never created', async () => {
    const cause = new Error('offline');
    const run = steps({ create: () => Promise.reject(cause) });
    expect(await startChatWithMessage(run)).toEqual({ kind: 'failed', stage: 'create', cause });
    expect(run.send).not.toHaveBeenCalled();
    expect(run.remove).not.toHaveBeenCalled();
  });

  it('tells the person their message is still there', () => {
    expect(sendFailureNotice('Home Hub')).toBe(
      'Couldn’t send. Home Hub didn’t answer. Your message is still here.',
    );
    expect(MACHINE_UNAVAILABLE_NOTICE).toContain('Your message is still here.');
  });
});
