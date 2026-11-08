import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DSH_SESSION_HEADER } from '@smarteverything/domain';
import type { AiSessionInfo, DshSessionEvent, DshSessionMetadata } from '@smarteverything/domain';
import { NO_SESSION_INFO, readSessionInfo } from '../../../src/harness/session-info-routes';
import type { ChatSessionSource } from '../../../src/harness/workspace-routes';

const PROFILE = randomUUID();
const CHAT = randomUUID();
const OWNER = { profileId: PROFILE, role: 'owner' } as const;

const METADATA: DshSessionMetadata = {
  chat_id: CHAT,
  profile_id: PROFILE,
  header: DSH_SESSION_HEADER.parse({ version: 4, id: 'session-1', createdAt: 0, isSeeded: false }),
  inherited_event_count: 2,
  next_seq: 1,
  durable_seq: 0,
};
const EVENTS: readonly DshSessionEvent[] = [
  { type: 'turn/start', seq: 0, time: 0, data: { turn: 1 } },
];

function source(sessionId: string | null): ChatSessionSource {
  return {
    own: () => ({ id: CHAT, profile_id: PROFILE }),
    binding: () => ({ session_id: sessionId, execution_target: { kind: 'server' } }),
    store: { dshSessions: { stat: () => METADATA, readAll: () => EVENTS } },
  };
}

const FIGURES: AiSessionInfo = {
  stats: { ...NO_SESSION_INFO.stats, turns: 1, steps: 2 },
  turns: [{ turn: 1, seq: 0, prompt: 'hi', response: 'hello' }],
};

describe('reading the conversation figures', () => {
  it('folds the stored metadata and events of the chat session', async () => {
    const seen: unknown[] = [];

    const info = await readSessionInfo(
      source('session-1'),
      (metadata, events) => {
        seen.push(metadata, events);
        return Promise.resolve(FIGURES);
      },
      OWNER,
      CHAT,
    );

    expect(info).toStrictEqual(FIGURES);
    expect(seen).toStrictEqual([METADATA, EVENTS]);
  });

  it('answers zero figures for a chat that has no session yet without folding', async () => {
    const info = await readSessionInfo(
      source(null),
      () => Promise.reject(new Error('Nothing should be folded.')),
      OWNER,
      CHAT,
    );

    expect(info).toStrictEqual(NO_SESSION_INFO);
    expect(Object.values(info.stats).every((value) => value === 0)).toBe(true);
  });
});
