import { CODEX_PROVIDER_TURN } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import type { CodexClient } from '../../src/codex/client';
import { openThread } from '../../src/codex/provider-thread';

const ID = '6b6e4f0e-2d6c-4f54-9d3a-0a4a4f5c7d11';
const CWD = '/work';
const SYSTEM = 'SmartEverything home instructions';

describe('Codex chat instructions', () => {
  it.each([null, 'owned-session'])(
    'adds the home instructions without replacing the native base for session %s',
    async (sessionId) => {
      const turn = CODEX_PROVIDER_TURN.parse({
        job_id: ID,
        device_id: ID,
        chat_id: ID,
        profile_id: ID,
        model: 'gpt-5.4',
        effort: null,
        session_id: sessionId,
        system: SYSTEM,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
        tools: [],
        options: { cwd: CWD },
      });
      const request = vi.fn<CodexClient['request']>().mockResolvedValue({
        modelProvider: 'openai',
        cwd: CWD,
        runtimeWorkspaceRoots: [CWD],
        thread: {
          id: 'owned-session',
          name: null,
          preview: '',
          cwd: CWD,
          model: turn.model,
          modelProvider: 'openai',
          createdAt: 0,
          updatedAt: 0,
          status: { type: 'idle' },
        },
      });
      await expect(openThread(turn, { request }, { cwd: CWD, roots: [] })).resolves.toBe(
        'owned-session',
      );
      expect(request).toHaveBeenCalledWith(
        sessionId === null ? 'thread/start' : 'thread/resume',
        expect.objectContaining({
          developerInstructions: SYSTEM,
          modelProvider: 'openai',
          allowProviderModelFallback: false,
        }),
      );
      expect(request.mock.calls[0]?.[1]).not.toHaveProperty('baseInstructions');
    },
  );
});
