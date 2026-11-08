import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DSH_SESSION_HEADER } from '@smarteverything/domain';
import type { DshSessionMetadata } from '@smarteverything/domain';
import { foldSessionInfo } from '../src/plugins/session-info';
import { bootRuntime, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

function metadataOf(host: RuntimeFixture, sessionId: string): DshSessionMetadata {
  const stored = host.persistence.sessions.get(sessionId);
  if (stored === undefined) throw new Error('The session was never stored.');
  return {
    chat_id: randomUUID(),
    profile_id: randomUUID(),
    header: DSH_SESSION_HEADER.parse(structuredClone(stored.header)),
    inherited_event_count: stored.inherited,
    next_seq: stored.events.length,
    durable_seq: stored.events.length - 1,
  };
}

async function converse(
  host: RuntimeFixture,
  sessionId: string,
  prompts: readonly string[],
): Promise<void> {
  const session = await host.runtime.create(host.sessionOptions(sessionId));
  let finished = 0;
  for (const prompt of prompts) {
    session.text(prompt);
    finished += 1;
    await turnsFinished(host, session, finished);
  }
}

describe('the whole-conversation figures', () => {
  it('count turns and steps and outline every turn from the stored log', async () => {
    fixture = await bootRuntime();
    const sessionId = randomUUID();
    fixture.model.script(
      { kind: 'tool', id: 'g1', name: 'glob', input: { pattern: '*.nothing' } },
      { kind: 'text', text: 'first answer' },
      { kind: 'text', text: 'second answer' },
    );
    await converse(fixture, sessionId, ['look around', 'and again']);

    const info = await foldSessionInfo(
      metadataOf(fixture, sessionId),
      fixture.persistence.sessions.get(sessionId)?.events,
    );

    expect(info.stats.turns).toBe(2);
    expect(info.stats.steps).toBe(3);
    expect(info.stats.llm_ms).toBeGreaterThanOrEqual(0);
    expect(info.turns.map((turn) => turn.prompt)).toStrictEqual(['look around', 'and again']);
    expect(info.turns.map((turn) => turn.response)).toStrictEqual([
      'first answer',
      'second answer',
    ]);
    expect(info.turns[0]?.seq).toBeLessThan(info.turns[1]?.seq ?? 0);
  });

  it('are zero for a conversation that has not started', async () => {
    fixture = await bootRuntime();
    const sessionId = randomUUID();
    await fixture.runtime.create(fixture.sessionOptions(sessionId));

    const info = await foldSessionInfo(
      metadataOf(fixture, sessionId),
      fixture.persistence.sessions.get(sessionId)?.events,
    );

    expect(info.stats).toMatchObject({ turns: 0, steps: 0, llm_ms: 0, tool_ms: 0 });
    expect(info.turns).toStrictEqual([]);
  });
});
