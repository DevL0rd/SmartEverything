import { randomUUID } from 'node:crypto';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { Session, SessionId } from '@deepseek-ai/dsh-session';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import { helperInputSource } from '../src/host/helper-input';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenerateOptions } from '@deepseek-ai/dsh-llm';
import { bootRuntime, spoken, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';
import { MemoryPersistence, StoredSession } from './support/memory-persistence';
import { HELPER_RESUME_TEXT, interruptedHelper } from '../src/host/helper-restarts';

const fixtures: RuntimeFixture[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.dispose().catch(() => undefined);
});

async function boot(persistence?: MemoryPersistence): Promise<RuntimeFixture> {
  const fixture = await bootRuntime(persistence === undefined ? {} : { persistence });
  fixtures.push(fixture);
  return fixture;
}

function isChild(request: GenerateOptions): boolean {
  return spoken(request.messages).some((message) => message.text.includes('Your parent agent id'));
}

function texts(request: GenerateOptions): string {
  return spoken(request.messages)
    .map((message) => message.text)
    .join('\n');
}

function crashCopy(source: MemoryPersistence): MemoryPersistence {
  const copy = new MemoryPersistence();
  for (const [id, stored] of source.sessions) {
    const cloned = new StoredSession(structuredClone(stored.header), stored.inherited);
    cloned.events.push(...structuredClone(stored.events));
    copy.sessions.set(id, cloned);
  }
  return copy;
}

async function parentWithRunningHelper(): Promise<{
  readonly host: RuntimeFixture;
  readonly options: ReturnType<RuntimeFixture['sessionOptions']>;
  readonly childId: string;
}> {
  const host = await boot();
  const options = host.sessionOptions();
  let parentCalls = 0;
  host.model.guard = (request): void => {
    if (isChild(request)) {
      host.model.script({ kind: 'hang' });
      return;
    }
    parentCalls += 1;
    host.model.script(
      parentCalls === 1
        ? {
            kind: 'tool',
            id: 'd1',
            name: 'subagent',
            input: { description: 'slow job', prompt: 'Do the slow part and report.' },
          }
        : { kind: 'text', text: 'I will report when it comes back.' },
    );
  };
  const session = await host.runtime.create(options);
  session.text('delegate something slow');
  await vi.waitFor(() => {
    expect(host.model.requests.filter(isChild)).toHaveLength(1);
    expect(host.model.requests.filter((request) => !isChild(request))).toHaveLength(2);
  });
  await turnsFinished(host, session, 1);
  const child = [...host.persistence.sessions.values()].find(
    (stored) => stored.header.origin === 'subagent',
  );
  if (child === undefined) throw new Error('The helper session is missing.');
  return { host, options, childId: child.header.id };
}

async function wokenAfterRestart(
  persistence: MemoryPersistence,
  options: ReturnType<RuntimeFixture['sessionOptions']>,
  childId: string,
): Promise<RuntimeFixture> {
  const next = await boot(persistence);
  next.model.guard = (request): void => {
    next.model.script(
      isChild(request)
        ? { kind: 'text', text: 'Slow part done.' }
        : { kind: 'text', text: 'The helper was resumed; noted.' },
    );
  };
  await next.runtime.resume({ ...options, directory: next.workspace });
  await vi.waitFor(() => {
    expect(next.model.requests.some((request) => texts(request).includes(childId))).toBe(true);
  });
  return next;
}

describe('a helper interrupted by a host restart', () => {
  it('resumes a helper stopped by a clean shutdown and tells its parent', async () => {
    const { host, options, childId } = await parentWithRunningHelper();
    const persistence = host.persistence;
    await host.runtime.dispose();
    const next = await wokenAfterRestart(persistence, options, childId);
    const woken = next.model.requests.filter((request) => !isChild(request)).map(texts);
    expect(woken[0]).toContain('was interrupted by a host restart');
    expect(woken[0]).toContain('SmartEverything resumed it');
    await vi.waitFor(() => {
      expect(next.model.requests.filter(isChild).map(texts).join('\n')).toContain(
        HELPER_RESUME_TEXT,
      );
    });
  });

  it('resumes a helper that died with the process and tells its parent once', async () => {
    const { host, options, childId } = await parentWithRunningHelper();
    const persistence = crashCopy(host.persistence);
    const next = await wokenAfterRestart(persistence, options, childId);
    await vi.waitFor(() => {
      expect(next.model.requests.filter(isChild).map(texts).join('\n')).toContain(
        HELPER_RESUME_TEXT,
      );
    });
    const parent = next.model.requests.filter((request) => !isChild(request)).map(texts);
    expect(parent[0]).toContain('was interrupted by a host restart');
    expect(parent[0]).toContain('SmartEverything resumed it');
    await vi.waitFor(() => {
      expect(next.runtime.get(options.sessionId).quiet()).toBe(true);
      expect(
        next.model.requests
          .filter((request) => !isChild(request))
          .map(texts)
          .join('\n'),
      ).toContain('Slow part done.');
    });
    await next.runtime.get(options.sessionId).flush();
    await next.runtime.dispose();
    const again = await boot(persistence);
    await again.runtime.resume({ ...options, directory: again.workspace });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(again.model.requests).toHaveLength(0);
  });
});

it('never resumes a directed helper turn even if the host lost it before consuming the claim', () => {
  const child = Session.create(SessionId(randomUUID()));
  const message = createUserMessage({
    source: helperInputSource(randomUUID()),
    content: [{ type: 'text', text: 'Please check.' }],
  });
  const events: SessionEvent[] = [
    child.append('agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [message] }),
    child.append('turn/start', { turn: 1 }),
    child.append('agent/inbox/spliced', {
      target: 'next-turn',
      start: 0,
      removedCount: 1,
      inserted: [],
    }),
  ];
  expect(interruptedHelper(child.id, events, new Set())).toBeUndefined();
  events.push(child.append('user/message', message, { surfaceOp: 'append' }));
  expect(interruptedHelper(child.id, events, new Set())).toBeUndefined();
});

it('continues to recover an ordinary helper turn with a directed input queued behind it', () => {
  const child = Session.create(SessionId(randomUUID()));
  const message = createUserMessage({
    source: helperInputSource(randomUUID()),
    content: [{ type: 'text', text: 'Please check later.' }],
  });
  const events: SessionEvent[] = [
    child.append('turn/start', { turn: 1 }),
    child.append('agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [message] }),
  ];
  expect(interruptedHelper(child.id, events, new Set())).toMatchObject({ childId: child.id });
});
