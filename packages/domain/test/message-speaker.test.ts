import { describe, expect, it } from 'vitest';
import { messageSpeaker } from '../src/message-speaker';
import type { AssistantMessageRow } from '../src/assistant';
import type { MessageOrigin } from '../src/ai-chats';

type Input = Pick<AssistantMessageRow, 'role' | 'author' | 'origin'>;

function origin(fields: Partial<MessageOrigin> & Pick<MessageOrigin, 'source'>): MessageOrigin {
  return { plugin_id: null, device_id: null, name: null, ...fields };
}

function message(role: Input['role'], originOf: MessageOrigin | null): Input {
  return { role, author: 'Ada', origin: originOf };
}

describe('messageSpeaker', () => {
  it('names the responder as the AI and system messages as the system', () => {
    expect(messageSpeaker(message('responder', null))).toStrictEqual({
      kind: 'ai',
      name: 'Ada',
      via: null,
      pluginId: null,
    });
    expect(messageSpeaker(message('system', null)).kind).toBe('system');
  });

  it('treats a message with no origin, or from the app or voice, as the owner themselves', () => {
    expect(messageSpeaker(message('person', null)).kind).toBe('me');
    expect(messageSpeaker(message('person', origin({ source: 'app' }))).kind).toBe('me');
    expect(messageSpeaker(message('person', origin({ source: 'voice' }))).via).toBe('voice');
  });

  it('treats a message from any other source as another person', () => {
    const speaker = messageSpeaker(message('person', origin({ source: 'wake' })));
    expect(speaker).toMatchObject({ kind: 'person', via: 'wake' });
  });

  it('decides a plugin message by who asked through it', () => {
    const mine = origin({ source: 'plugin', plugin_id: 'bridge', requester: 'owner' });
    const theirs = origin({ source: 'plugin', plugin_id: 'bridge', requester: 'approved' });
    expect(messageSpeaker(message('person', mine))).toMatchObject({
      kind: 'me',
      pluginId: 'bridge',
    });
    expect(messageSpeaker(message('person', theirs)).kind).toBe('person');
  });
});
