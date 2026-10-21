import { afterEach, describe, expect, it } from 'vitest';
import { MessageId, createUserMessage } from '@deepseek-ai/dsh-llm';
import { bootRuntime, spoken, statuses, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

let fixture: RuntimeFixture | undefined;

afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

const FAILURE = { code: 'AUTH', message: '401 Unauthorized' };
const NOTE = 'Continue the work you were doing.';

function prompt(id: string, text: string): ReturnType<typeof createUserMessage> {
  return {
    ...createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }),
    id: MessageId(id),
  };
}

describe('resending a prompt with the same delivery id', () => {
  it('keeps one continue note and one original message across repeated failed retries', async () => {
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
      session.prompt(prompt('note-1', NOTE));
      await turnsFinished(host, session, attempt);
    }

    expect(host.model.requests).toHaveLength(5);
    const last = spoken(host.model.requests[4]?.messages ?? []).filter((m) => m.role === 'user');
    expect(last.filter((m) => m.text === NOTE)).toHaveLength(1);
    expect(last.filter((m) => m.text === 'build the report')).toHaveLength(1);
    expect(statuses(host.events).at(-1)).toBe('idle');
  });
});
