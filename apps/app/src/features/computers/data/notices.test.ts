import { QueryClient } from '@tanstack/react-query';
import {
  CLAUDE_SESSION,
  COMPUTER_AI_STATUS,
  DEFAULT_COMPUTER_AI_SETTINGS,
  type ClaudeSession,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { EntityStore } from '../../../store/entity-store';
import { COMPUTER_NOTICES } from './notices';

const DEVICE = '11111111-1111-4111-8111-111111111111';

function status(version: string): ReturnType<typeof COMPUTER_AI_STATUS.parse> {
  return COMPUTER_AI_STATUS.parse({
    device_id: DEVICE,
    local: true,
    online: true,
    settings: DEFAULT_COMPUTER_AI_SETTINGS,
    capabilities: {
      runtime_version: version,
      operations: [],
      settings: [],
      control_reason: null,
      provider_reason: null,
    },
  });
}

describe('computer AI status notices', () => {
  it('refetches nothing for an identical status and does for a changed one', () => {
    const client = new QueryClient();
    const context = { client, store: new EntityStore(), live: true };
    const invalidated: unknown[] = [];
    client.invalidateQueries = (filters): Promise<void> => {
      invalidated.push(filters?.queryKey);
      return Promise.resolve();
    };
    const receive = (version: string): void => {
      COMPUTER_NOTICES.receive({ type: 'computer_ai_status', status: status(version) }, context);
    };

    receive('1.0.0');
    const first = invalidated.length;
    for (let notice = 0; notice < 100; notice += 1) receive('1.0.0');
    expect(invalidated.length).toBe(first);
    receive('1.0.1');
    expect(invalidated.length).toBeGreaterThan(first);
  });
});

function session(id: string, change: Partial<ClaudeSession> = {}): ClaudeSession {
  const none = null;
  return CLAUDE_SESSION.parse({
    id,
    desktop_id: none,
    title: id,
    cwd: '/work',
    state: 'idle',
    last_state: none,
    archived: false,
    model: none,
    permission_mode: 'default',
    entrypoint: none,
    pid: none,
    started_at: none,
    updated_at: none,
    waiting_prompts: 0,
    context_used: none,
    capabilities: {
      send: none,
      interrupt: none,
      answer_prompts: none,
      set_mode: none,
      set_model: none,
      usage: none,
    },
    ...change,
  });
}

describe('Claude session notices', () => {
  function rig(): {
    readonly client: QueryClient;
    readonly invalidated: (readonly unknown[])[];
    readonly receive: (notice: Parameters<typeof COMPUTER_NOTICES.receive>[0]) => void;
  } {
    const client = new QueryClient();
    const invalidated: (readonly unknown[])[] = [];
    client.invalidateQueries = (filters): Promise<void> => {
      invalidated.push(filters?.queryKey ?? []);
      return Promise.resolve();
    };
    const context = { client, store: new EntityStore(), live: true };
    return {
      client,
      invalidated,
      receive: (notice): void => {
        COMPUTER_NOTICES.receive(notice, context);
      },
    };
  }
  const listKey = ['window', 'computer-ai', DEVICE, 'sessions', 'false'];

  it('does not refetch any list for a thread line of a session, only that session', () => {
    const { client, invalidated, receive } = rig();
    client.setQueryData(listKey, [session('a')]);
    receive({
      type: 'computer_claude',
      device_id: DEVICE,
      notice: {
        type: 'claude_thread',
        session_id: 'a',
        items: [
          {
            id: '1.0',
            at: null,
            sidechain: false,
            meta: false,
            truncated: false,
            kind: 'user',
            text: 'hi',
          },
        ],
      },
    });
    expect(invalidated).toEqual([['window', 'computer-ai', DEVICE, 'session', 'a']]);
  });

  it('patches a listed session in place without a refetch', () => {
    const { client, invalidated, receive } = rig();
    client.setQueryData(listKey, [session('a'), session('b')]);
    receive({
      type: 'computer_claude',
      device_id: DEVICE,
      notice: { type: 'claude_session', session: session('a', { state: 'busy' }) },
    });
    expect(invalidated).toEqual([]);
    expect(client.getQueryData<ClaudeSession[]>(listKey)?.map((row) => row.state)).toEqual([
      'busy',
      'idle',
    ]);
  });

  it('refetches the list when a session it does not hold appears and drops a gone one', () => {
    const { client, invalidated, receive } = rig();
    client.setQueryData(listKey, [session('a')]);
    receive({
      type: 'computer_claude',
      device_id: DEVICE,
      notice: { type: 'claude_session', session: session('new') },
    });
    expect(invalidated).toEqual([listKey]);
    receive({
      type: 'computer_claude',
      device_id: DEVICE,
      notice: { type: 'claude_session_gone', id: 'a' },
    });
    expect(client.getQueryData<ClaudeSession[]>(listKey)).toEqual([]);
  });
});
