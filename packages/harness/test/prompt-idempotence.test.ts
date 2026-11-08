import { afterEach, describe, expect, it } from 'vitest';
import { MessageId, createUserMessage } from '@deepseek-ai/dsh-llm';
import type { MessageSource } from '@deepseek-ai/dsh-llm';
import { HUB_NOTE_SOURCE, hubNoteText } from '../src/host/hub-note';
import { bootRuntime, spoken, statuses, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

let fixture: RuntimeFixture | undefined;

afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

const FAILURE = { code: 'AUTH', message: '401 Unauthorized' };
const NOTE = hubNoteText('Continue the work you were doing.');

function prompt(
  id: string,
  text: string,
  source: MessageSource = { kind: 'user' },
): ReturnType<typeof createUserMessage> {
  return { ...createUserMessage({ content: [{ type: 'text', text }], source }), id: MessageId(id) };
}

describe('resending a prompt with the same delivery id', () => {
  it('keeps one hub continue note, marked as not the person, and one original message across retries', async () => {
    fixture = await bootRuntime();
    const host = fixture;
    host.model.script(
      { kind: 'fail', failure: FAILURE },
      { kind: 'fail', failure: FAILURE },
      { kind: 'fail', failure: FAILURE },
      { kind: 'fail', failure: FAILURE },
      { kind: 'text', text: 'done' },
    );
    const session = await host.runtime.create(host.sessionOptions());

    session.prompt(prompt('original', 'build the report'));
    await turnsFinished(host, session, 1);
    for (let attempt = 2; attempt <= 5; attempt += 1) {
      session.prompt(prompt('note-1', NOTE, HUB_NOTE_SOURCE));
      await turnsFinished(host, session, attempt);
    }

    expect(host.model.requests).toHaveLength(5);
    const last = spoken(host.model.requests[4]?.messages ?? []).filter((m) => m.role === 'user');
    expect(last.filter((m) => m.text === NOTE)).toHaveLength(1);
    expect(NOTE).toBe(
      'Note from SmartEverything, not written by the person: Continue the work you were doing.',
    );
    expect(last.filter((m) => m.text === 'build the report')).toHaveLength(1);
    expect(statuses(host.events).at(-1)).toBe('idle');
  });
});
