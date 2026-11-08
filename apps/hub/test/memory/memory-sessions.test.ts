import { describe, expect, it } from 'vitest';
import { CONVERSATION_AUTHORITY } from '../../src/harness/authority-contract';
import type { ToolCaller } from '../../src/ai-tools/hub-tool';
import { HarnessMemorySessions } from '../../src/memory/sessions';

const PROFILE = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0001';
const CHAT = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0002';
const EVENT = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0003';
const MESSAGE = '7b7a1c1e-3a0f-4c63-9a1b-0a8f8c0c0004';

const AUTHORITY = CONVERSATION_AUTHORITY.parse({
  event_id: EVENT,
  profile_id: PROFILE,
  client_id: null,
  kind: 'client',
  role: 'member',
  hub_os_ban: false,
  tools: null,
  plugin_id: null,
  requester: null,
});

function caller(extra: Partial<ToolCaller> = {}): ToolCaller {
  return {
    profileId: PROFILE,
    role: 'member',
    chatId: CHAT,
    via: 'chat',
    clientId: null,
    ...extra,
  };
}

describe('the person behind a native session', () => {
  it('is the profile, role and chat the session grant resolves to, never anything the model sends', () => {
    const sessions = new HarnessMemorySessions(
      { caller: (): ToolCaller => caller() },
      (): string | null => {
        throw new Error('A session without a turn authority reads no event.');
      },
      (): string => '',
    );

    expect(sessions.principal('any')).toStrictEqual({
      profileId: PROFILE,
      role: 'member',
      chatId: CHAT,
      messageId: null,
    });
  });

  it('names the message that started the turn when the session runs for an event', () => {
    const seen: string[] = [];
    const sessions = new HarnessMemorySessions(
      { caller: (): ToolCaller => caller({ authority: AUTHORITY }) },
      (id): string | null => {
        seen.push(id);
        return MESSAGE;
      },
      (): string => '',
    );

    expect(sessions.principal('any').messageId).toBe(MESSAGE);
    expect(seen).toStrictEqual([EVENT]);
  });
});
