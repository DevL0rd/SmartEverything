import { describe, expect, it, vi } from 'vitest';
import type { ClaudeCliStart } from '@smarteverything/domain';
import { ManagedClaudeService } from '../../src/claude/managed-service';
import type { ManagedClaudeActor, ManagedClaudeContext } from '../../src/claude/managed-scope';

const CHAT = '0f9a8c1e-7a3b-4d77-8d5e-3b0f6f7a2c10';
const DEVICE = '3c1d5a52-9a0e-4b0d-8f0b-7f2b1f6d4e90';
const PROFILE = 'a2c8d0aa-52a4-4c87-8c33-0c6e5e3d9b21';
const CLIENT = 'b3c8d0aa-52a4-4c87-8c33-0c6e5e3d9b22';
const OPERATION = 'c4c8d0aa-52a4-4c87-8c33-0c6e5e3d9b23';

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- partial fake of a large collaborator
function loose<T>(value: object): T {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- partial fake of a large collaborator
  return Object.assign(Object.create(null), value);
}

function rig(): {
  readonly service: ManagedClaudeService;
  readonly calls: string[];
  readonly request: ReturnType<typeof vi.fn>;
  readonly saved: ReturnType<typeof vi.fn>;
  readonly created: ReturnType<typeof vi.fn>;
  readonly removed: ReturnType<typeof vi.fn>;
} {
  const calls: string[] = [];
  const request = vi.fn((_device: string, _request: unknown): Promise<{ session_id: string }> => {
    calls.push('adopt');
    return Promise.resolve({ session_id: 'forked-session' });
  });
  const saved = vi.fn((): void => {
    calls.push('save');
  });
  const chat = {
    id: CHAT,
    profile_id: PROFILE,
    archived_at: null,
    updated_at: '2026-10-18T00:00:00.000Z',
    engine: { kind: 'claude', device_id: DEVICE, settings: { cwd: '/work' } },
  };
  const runner = {
    state: {
      read: (): Record<string, unknown> => ({
        runtime: 'claude',
        session_id: null,
        job_id: null,
        state: 'idle',
      }),
      save: saved,
    },
  };
  const created = vi.fn((_actor: unknown, _input: unknown) => chat);
  const removed = vi.fn((_actor: unknown, _chatId: string): Promise<void> => Promise.resolve());
  const context = loose<ManagedClaudeContext>({
    store: {
      claudeCliOperations: {
        recover: () => undefined,
        known: () => undefined,
        reserve: () => undefined,
        bind: () => undefined,
        binding: () => ({ profile_id: PROFILE, device_id: DEVICE, cwd: '/work' }),
        timestamp: () => '2026-10-18T00:00:00.000Z',
        save: (receipt: unknown): unknown => receipt,
      },
      durableWrite: <T>(write: () => T): T => write(),
      clients: { byId: () => ({ role: 'owner' }) },
      profiles: { activeOf: () => ({ id: PROFILE }) },
      personAccess: { standing: () => ({ known: true, role: 'owner', schedule: null }) },
    },
    assistant: {
      createChat: created,
      removeChat: removed,
      chats: { own: () => chat },
      computerProviders: new Map([['claude', runner]]),
      send: () => {
        calls.push('send');
        return { id: 'message-1' };
      },
    },
    computerAi: {
      status: () => ({
        online: true,
        settings: { provider: { enabled: true } },
        capabilities: { provider_reason: null },
      }),
      request,
    },
  });
  return { service: new ManagedClaudeService(context), calls, request, saved, created, removed };
}

const ACTOR: ManagedClaudeActor = {
  profileId: PROFILE,
  role: 'owner',
  clientId: CLIENT,
};

function start(change: Partial<ClaudeCliStart>): ClaudeCliStart {
  return {
    operation_id: OPERATION,
    model: 'sonnet',
    effort: null,
    settings: { builtin_tools: [], cwd: '/work' },
    message: { text: 'carry on', attachments: [] },
    ...change,
  };
}

describe('starting an app chat from a desktop session', () => {
  it('forks the desktop session, binds the fork to the chat, then sends the first message', async () => {
    const { service, calls, request, saved } = rig();
    const receipt = await service.start(
      ACTOR,
      DEVICE,
      start({ continue_from: { session_id: 'desktop-session' } }),
    );
    expect(receipt.state).toBe('accepted');
    expect(request).toHaveBeenCalledWith(
      DEVICE,
      {
        operation: 'provider_adopt',
        session_id: 'desktop-session',
        chat_id: CHAT,
        profile_id: PROFILE,
        cwd: '/work',
      },
      expect.anything(),
    );
    expect(saved).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ session_id: 'forked-session' }),
    );
    expect(calls).toEqual(['adopt', 'save', 'send']);
  });

  it('forks without sending anything when no first message is given', async () => {
    const { service, calls } = rig();
    const receipt = await service.start(ACTOR, DEVICE, {
      operation_id: OPERATION,
      model: 'sonnet',
      effort: null,
      settings: { builtin_tools: [], cwd: '/work' },
      continue_from: { session_id: 'desktop-session' },
    });
    expect(receipt.state).toBe('accepted');
    expect(receipt.message_id).toBeNull();
    expect(calls).toEqual(['adopt', 'save']);
  });

  it('records the desktop session on the new chat engine so the app list can hide the duplicate', async () => {
    const { service, created } = rig();
    await service.start(ACTOR, DEVICE, start({ continue_from: { session_id: 'desktop-session' } }));
    expect(created.mock.calls[0]?.[1]).toMatchObject({
      engine: { continued_from: 'desktop-session' },
    });
  });

  it('does not ask the computer to fork anything for an ordinary new session', async () => {
    const { service, calls } = rig();
    await service.start(ACTOR, DEVICE, start({}));
    expect(calls).toEqual(['send']);
  });

  it('keeps the receipt unknown, sends nothing and removes the empty chat when the computer refuses the fork', async () => {
    const { service, calls, request, removed } = rig();
    request.mockRejectedValueOnce(new Error('session not found'));
    const receipt = await service.start(
      ACTOR,
      DEVICE,
      start({ continue_from: { session_id: 'missing' } }),
    );
    expect(receipt.state).toBe('unknown');
    expect(receipt.reason).toContain('session not found');
    expect(calls).toEqual([]);
    expect(removed).toHaveBeenCalledWith(ACTOR, CHAT);
  });

  it('keeps the chat when the fork succeeded', async () => {
    const { service, removed } = rig();
    const receipt = await service.start(
      ACTOR,
      DEVICE,
      start({ continue_from: { session_id: 'desktop-session' }, message: undefined }),
    );
    expect(receipt.state).toBe('accepted');
    expect(removed).not.toHaveBeenCalled();
  });
});
