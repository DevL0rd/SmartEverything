import { describe, expect, it } from 'vitest';
import { PROVIDER_TURN, type ProviderTurn } from '@smarteverything/domain';
import { nativeSourcesEnabled } from '../../src/claude/provider/agent-scope';
import { configuredOptions } from '../../src/claude/provider/configured-options';

function turn(change: Partial<ProviderTurn> = {}): ProviderTurn {
  return PROVIDER_TURN.parse({
    job_id: '6b6e4f0e-2d6c-4f54-9d3a-0a4a4f5c7d11',
    device_id: '3c1d5a52-9a0e-4b0d-8f0b-7f2b1f6d4e90',
    chat_id: '0f9a8c1e-7a3b-4d77-8d5e-3b0f6f7a2c10',
    profile_id: 'a2c8d0aa-52a4-4c87-8c33-0c6e5e3d9b21',
    model: 'sonnet',
    effort: null,
    session_id: null,
    system: 'system',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    tools: [],
    options: { builtin_tools: [], cwd: '/work' },
    ...change,
  });
}

describe('Claude settings sources in app chats', () => {
  it('load the user and project setup for a chat in a working directory', () => {
    expect(configuredOptions(turn()).settingSources).toEqual(['user', 'project']);
    expect(nativeSourcesEnabled(turn())).toBe(true);
  });

  it('are off when the computer turns every source off', () => {
    const none = turn({ options: { builtin_tools: [], cwd: '/work', setting_sources: [] } });
    expect(configuredOptions(none).settingSources).toEqual([]);
    expect(nativeSourcesEnabled(none)).toBe(false);
  });

  it('never load for a chat edited centrally without a working directory', () => {
    const managed = turn({
      options: { builtin_tools: [], setting_sources: ['user', 'project'] },
      managed_project: { protocol: 1, chat_id: '0f9a8c1e-7a3b-4d77-8d5e-3b0f6f7a2c10' },
    });
    expect(configuredOptions(managed).settingSources).toEqual([]);
    expect(nativeSourcesEnabled(managed)).toBe(false);
  });
});
