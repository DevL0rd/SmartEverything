import { afterEach, describe, expect, it } from 'vitest';
import { forkNativeHistory, readNativeHistory } from '../src/process';
import {
  assistantReplies,
  bootRuntime,
  eventTypes,
  turnsFinished,
  userMessages,
} from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

async function twoTurns(): Promise<{
  readonly host: RuntimeFixture;
  readonly header: unknown;
  readonly events: readonly unknown[];
}> {
  const host = await bootRuntime();
  fixture = host;
  host.model.script(
    { kind: 'text', text: 'first answer' },
    { kind: 'text', text: 'second answer' },
  );
  const options = host.sessionOptions();
  const session = await host.runtime.create(options);
  session.text('first question');
  await turnsFinished(host, session, 1);
  session.text('second question');
  await turnsFinished(host, session, 2);
  const stored = host.persistence.sessions.get(options.sessionId);
  return { host, header: stored?.header, events: stored?.events ?? [] };
}

describe('the durable log of a conversation', () => {
  it('is a valid, gap-free history holding exactly the events the session announced', async () => {
    const { host, header, events } = await twoTurns();

    const history = readNativeHistory(header, events);

    expect(history.map((event) => event.seq)).toStrictEqual(events.map((_event, index) => index));
    expect(history.map((event) => event.type)).toStrictEqual(eventTypes(host.events));
  });

  it('keeps each question and answer once, in conversation order', async () => {
    const { header, events } = await twoTurns();
    const history = readNativeHistory(header, events);

    expect(userMessages(history)).toStrictEqual(['first question', 'second question']);
    expect(assistantReplies(history)).toStrictEqual(['first answer', 'second answer']);
  });
});

describe('branching the durable log', () => {
  it('copies the conversation only up to the chosen turn boundary', async () => {
    const { header, events } = await twoTurns();
    const history = readNativeHistory(header, events);
    const firstTurnEnd = history.find((event) => event.type === 'turn/end')?.seq ?? -1;

    const seed = forkNativeHistory(header, events, firstTurnEnd);

    expect(userMessages(seed)).toStrictEqual(['first question']);
    expect(assistantReplies(seed)).toStrictEqual(['first answer']);
  });

  it('copies everything when the boundary is the last event', async () => {
    const { header, events } = await twoTurns();

    const seed = forkNativeHistory(header, events, events.length - 1);

    expect(userMessages(seed)).toStrictEqual(['first question', 'second question']);
  });
});
