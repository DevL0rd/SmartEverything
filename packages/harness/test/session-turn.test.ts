import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  assistantReplies,
  bootRuntime,
  eventTypes,
  spoken,
  statuses,
  streamedText,
  turnsFinished,
} from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

let fixture: RuntimeFixture | undefined;

async function booted(): Promise<RuntimeFixture> {
  fixture = await bootRuntime();
  return fixture;
}

afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

describe('a native turn', () => {
  it('streams the reply as it is generated and finishes with one durable assistant message', async () => {
    const host = await booted();
    host.model.script({ kind: 'text', text: 'Hello there' });
    const options = host.sessionOptions();
    const session = await host.runtime.create(options);

    session.text('hi');
    await session.drain();

    expect(streamedText(host.events)).toBe('Hello there');
    expect(assistantReplies(host.persistence.events(options.sessionId))).toStrictEqual([
      'Hello there',
    ]);
    expect(statuses(host.events)).toStrictEqual(['running', 'idle']);
    expect(eventTypes(host.events).filter((type) => type === 'turn/end')).toHaveLength(1);
  });

  it('sends the person message to the model and writes it to the durable log', async () => {
    const host = await booted();
    host.model.script({ kind: 'text', text: 'ok' });
    const options = host.sessionOptions();
    const session = await host.runtime.create(options);

    session.text('what is the weather');
    await session.drain();

    const [request] = host.model.requests;
    expect(request?.model).toBe(options.model);
    expect(spoken(request?.messages ?? []).filter((m) => m.role === 'user')).toContainEqual({
      role: 'user',
      text: 'what is the weather',
    });
    expect(eventTypes(host.events)).toContain('user/message');
    expect(host.persistence.events(options.sessionId).map((event) => event.type)).toContain(
      'user/message',
    );
  });

  it('keeps earlier turns in the context of later ones', async () => {
    const host = await booted();
    host.model.script(
      { kind: 'text', text: 'first answer' },
      { kind: 'text', text: 'second answer' },
    );
    const session = await host.runtime.create(host.sessionOptions());

    session.text('first question');
    await turnsFinished(host, session, 1);
    session.text('second question');
    await turnsFinished(host, session, 2);

    const texts = spoken(host.model.requests[1]?.messages ?? []).map((m) => m.text);
    expect(texts).toStrictEqual(
      expect.arrayContaining(['first question', 'first answer', 'second question']),
    );
    expect(texts.indexOf('first answer')).toBeLessThan(texts.indexOf('second question'));
  });

  it('runs a tool the model asks for and feeds its result into the next step', async () => {
    const host = await booted();
    const file = join(host.directory, 'note.txt');
    host.model.script(
      { kind: 'tool', id: 'call-1', name: 'write', input: { file_path: file, content: 'hello' } },
      { kind: 'text', text: 'Saved it' },
    );
    const options = host.sessionOptions();
    const session = await host.runtime.create(options);

    session.text('save a note');
    await session.drain();

    expect(await readFile(file, 'utf8')).toBe('hello');
    expect(host.model.requests).toHaveLength(2);
    const followUp = host.model.requests[1]?.messages.at(-1);
    expect(followUp?.role).toBe('tool');
    expect(eventTypes(host.events)).toContain('tool/result');
    expect(assistantReplies(host.persistence.events(options.sessionId)).at(-1)).toBe('Saved it');
  });

  it('stops a running turn on interrupt and leaves the session idle and usable', async () => {
    const host = await booted();
    host.model.script({ kind: 'hang' }, { kind: 'text', text: 'back again' });
    const options = host.sessionOptions();
    const session = await host.runtime.create(options);

    session.text('start something long');
    await vi.waitFor(() => {
      expect(host.model.requests).toHaveLength(1);
    });
    await session.interrupt();

    expect(statuses(host.events).at(-1)).toBe('idle');
    expect(assistantReplies(host.persistence.events(options.sessionId))).toStrictEqual([]);

    session.text('try again');
    await turnsFinished(host, session, 2);
    expect(streamedText(host.events)).toBe('back again');
  });

  it('ends a turn the model fails permanently and accepts the next prompt on the same session', async () => {
    const host = await booted();
    host.model.script(
      { kind: 'fail', failure: { code: 'AUTH', message: '401 Unauthorized' } },
      { kind: 'text', text: 'recovered' },
    );
    const options = host.sessionOptions();
    const session = await host.runtime.create(options);

    session.text('first');
    await turnsFinished(host, session, 1);

    expect(host.model.requests).toHaveLength(1);
    expect(statuses(host.events).at(-1)).toBe('idle');
    expect(assistantReplies(host.persistence.events(options.sessionId))).toStrictEqual([]);

    session.text('second');
    await turnsFinished(host, session, 2);

    expect(host.model.requests).toHaveLength(2);
    expect(streamedText(host.events)).toBe('recovered');
    expect(assistantReplies(host.persistence.events(options.sessionId))).toStrictEqual([
      'recovered',
    ]);
  });

  it('retries a transient model failure after a tool ran without running the tool again', async () => {
    const host = await booted();
    const file = join(host.directory, 'once.txt');
    host.model.script(
      { kind: 'tool', id: 'call-1', name: 'write', input: { file_path: file, content: 'once' } },
      {
        kind: 'fail',
        failure: { code: 'SERVER', message: '503 overloaded', providerRetryAfterMs: 20 },
      },
      { kind: 'text', text: 'Saved it' },
    );
    const options = host.sessionOptions();
    const session = await host.runtime.create(options);

    session.text('save a note');
    await turnsFinished(host, session, 1);

    expect(host.model.requests).toHaveLength(3);
    expect(eventTypes(host.events).filter((type) => type === 'tool/result')).toHaveLength(1);
    expect(eventTypes(host.events)).toContain('llm/retry');
    expect(assistantReplies(host.persistence.events(options.sessionId)).at(-1)).toBe('Saved it');
  });

  it('refuses new prompts once the session writer ownership is lost', async () => {
    const host = await booted();
    const options = host.sessionOptions();
    const session = await host.runtime.create(options);

    host.persistence.loseOwnership(options.sessionId);
    await host.runtime.whenOwnershipLossSettled(options.sessionId);

    expect(() => {
      session.text('hello?');
    }).toThrow(/frozen/u);
  });
});

describe('closing and reopening a session', () => {
  it('drops the session on close', async () => {
    const host = await booted();
    const options = host.sessionOptions();
    await host.runtime.create(options);

    await host.runtime.close(options.sessionId);

    expect(() => host.runtime.get(options.sessionId)).toThrow(/not active/u);
  });

  it('resumes from the durable log with the earlier conversation intact', async () => {
    const host = await booted();
    host.model.script({ kind: 'text', text: 'blue' }, { kind: 'text', text: 'still blue' });
    const options = host.sessionOptions();
    const first = await host.runtime.create(options);
    first.text('favourite colour?');
    await turnsFinished(host, first, 1);
    await host.runtime.close(options.sessionId);

    const second = await host.runtime.resume(options);
    second.text('and now?');
    await turnsFinished(host, second, 2);

    const texts = spoken(host.model.requests[1]?.messages ?? []).map((m) => m.text);
    expect(texts).toStrictEqual(expect.arrayContaining(['favourite colour?', 'blue', 'and now?']));
    expect(assistantReplies(host.persistence.events(options.sessionId))).toStrictEqual([
      'blue',
      'still blue',
    ]);
  });

  it('does not open the same session twice on one host', async () => {
    const host = await booted();
    const options = host.sessionOptions();
    await host.runtime.create(options);

    await expect(host.runtime.create(options)).rejects.toThrow(/already open/u);
  });
});
