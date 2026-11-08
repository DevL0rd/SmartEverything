import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SESSION_TITLE_POLICY } from '../src/plugins/session-titles';
import { AI_CHAT_TITLE_MAX } from '@smarteverything/domain';
import { bootRuntime, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

const LOGGED_TITLE = z.object({ title: z.string(), source: z.object({ kind: z.string() }) });

function titles(host: RuntimeFixture, sessionId: string): readonly z.infer<typeof LOGGED_TITLE>[] {
  const events = host.persistence.sessions.get(sessionId)?.events ?? [];
  return events.flatMap((event) =>
    event.type === 'session/title' ? [LOGGED_TITLE.parse(event.data)] : [],
  );
}

async function ask(host: RuntimeFixture, text: string): Promise<string> {
  const options = host.sessionOptions();
  const session = await host.runtime.create(options);
  session.text(text);
  await turnsFinished(host, session, 1);
  return options.sessionId;
}

describe('session titles', () => {
  it('logs the first words at once and then the title the model wrote for the first prompt', async () => {
    const host = await bootRuntime();
    fixture = host;
    host.model.script({ kind: 'text', text: 'Done.' });
    host.model.scriptTitles({ kind: 'text', text: 'Garden lights' });

    const sessionId = await ask(host, 'Turn on the garden lights at dusk please');
    await expect
      .poll(() => titles(host, sessionId).map((entry) => entry.source.kind))
      .toEqual(['fallback', 'provider']);

    expect(titles(host, sessionId).at(-1)?.title).toBe('Garden lights');
    expect(host.model.titleRequests).toHaveLength(1);
    expect(host.model.titleRequests[0]).toMatchObject({
      purpose: 'session-title',
      maxTokens: SESSION_TITLE_POLICY.generation.maxOutputTokens,
      sessionId,
      provider: host.model.requests[0]?.provider,
      model: host.model.requests[0]?.model,
    });
  });

  it('keeps the first-words title when the model call fails', async () => {
    const host = await bootRuntime();
    fixture = host;
    host.model.script({ kind: 'text', text: 'Done.' });
    host.model.scriptTitles({
      kind: 'fail',
      failure: { message: 'The supplier refused the call.', code: 'AUTH' },
    });

    const sessionId = await ask(host, 'Turn on the garden lights at dusk please');
    await expect.poll(() => host.model.titleRequests.length).toBe(1);

    expect(titles(host, sessionId).map((entry) => entry.source.kind)).toEqual(['fallback']);
  });

  it('sizes the title limits so any title that fits a chat name passes', () => {
    const { title } = SESSION_TITLE_POLICY;
    expect(title.maxTitleBytes).toBeGreaterThanOrEqual(AI_CHAT_TITLE_MAX * 4);
    expect(title.fallbackMaxBytes).toBeLessThanOrEqual(title.maxTitleBytes);
  });
});
