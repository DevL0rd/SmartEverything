import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  CLAUDE_SESSION,
  COMPUTER_AI_MODEL,
  COMPUTER_AI_STATUS,
} from '@smarteverything/domain';
import { DESKTOP_FORK_UNSUPPORTED, forkDesktopSession, type DesktopForkIo } from './desktop-fork';

const DEVICE = '3c1d5a52-9a0e-4b0d-8f0b-7f2b1f6d4e90';
const SESSION = CLAUDE_SESSION.parse({
  id: '5f0e1c52-1a0e-4b0d-8f0b-7f2b1f6d4e91',
  desktop_id: null,
  title: 'Fix it',
  cwd: '/work/app',
  state: 'idle',
  last_state: null,
  archived: false,
  model: null,
  permission_mode: 'unknown',
  entrypoint: null,
  pid: null,
  started_at: null,
  updated_at: null,
  waiting_prompts: 0,
  context_used: null,
  capabilities: {
    send: null,
    interrupt: null,
    answer_prompts: null,
    set_mode: null,
    set_model: null,
    usage: null,
  },
});
const STATUS = COMPUTER_AI_STATUS.parse({
  device_id: DEVICE,
  local: false,
  online: true,
  settings: {
    control: { enabled: true, auto_link: false },
    provider: { enabled: true, options: { builtin_tools: [] } },
  },
  capabilities: {
    runtime_version: null,
    operations: [],
    settings: [],
    control_reason: null,
    provider_reason: null,
  },
});
const MODEL = COMPUTER_AI_MODEL.parse({
  device_id: DEVICE,
  id: 'sonnet',
  resolved_model: null,
  name: 'Sonnet',
  description: '',
  efforts: [],
  adaptive_thinking: false,
  fast: false,
  available: true,
  reason: null,
});

function rig(change: Partial<DesktopForkIo> = {}): DesktopForkIo {
  return {
    readStatus: () => Promise.resolve(STATUS),
    listModels: () => Promise.resolve([MODEL]),
    start: vi.fn<DesktopForkIo['start']>(() =>
      Promise.resolve({ state: 'accepted', chat_id: 'app-chat', reason: null }),
    ),
    newId: () => 'operation-1',
    ...change,
  };
}

const target = { deviceId: 'pc', session: SESSION, owner: true };

describe('forking a Desktop session into an app chat', () => {
  it('starts a continuation with no first prompt and returns the new chat id', async () => {
    const io = rig();
    await expect(forkDesktopSession(target, io)).resolves.toBe('app-chat');
    expect(io.start).toHaveBeenCalledWith('pc', {
      operation_id: 'operation-1',
      model: 'sonnet',
      effort: null,
      settings: { builtin_tools: [], cwd: '/work/app' },
      continue_from: { session_id: SESSION.id },
      title: 'Fix it',
    });
  });

  it('says plainly that the hub update is pending when the hub rejects the request shape', async () => {
    const io = rig({
      start: () => Promise.reject(new ApiError('invalid_request', 'Unrecognized key')),
    });
    await expect(forkDesktopSession(target, io)).rejects.toThrow(DESKTOP_FORK_UNSUPPORTED);
  });

  it('reports the computer reason when the fork was not accepted', async () => {
    const io = rig({
      start: () =>
        Promise.resolve({ state: 'unknown', chat_id: 'app-chat', reason: 'session not found' }),
    });
    await expect(forkDesktopSession(target, io)).rejects.toThrow('session not found');
  });

  it('refuses without starting anything when the computer cannot run Claude', async () => {
    const io = rig({ readStatus: () => Promise.resolve({ ...STATUS, online: false }) });
    await expect(forkDesktopSession(target, io)).rejects.toThrow('offline');
    expect(io.start).not.toHaveBeenCalled();
  });

  it('refuses a session without a folder', async () => {
    const io = rig();
    await expect(
      forkDesktopSession({ ...target, session: { ...SESSION, cwd: null } }, io),
    ).rejects.toThrow('no folder');
    expect(io.start).not.toHaveBeenCalled();
  });
});
