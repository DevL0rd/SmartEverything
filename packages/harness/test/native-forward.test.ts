import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@smarteverything/domain';
import type { HarnessNativeFrame } from '@smarteverything/domain';
import { bootDispatcher } from './support/dispatcher';
import type { DispatcherFixture } from './support/dispatcher';

let fixture: DispatcherFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

function kinds(frames: readonly HarnessNativeFrame[]): readonly string[] {
  return frames.map((frame) => frame.kind);
}

describe('what the machine forwards to the hub', () => {
  it('opens the chat before anything else and closes it last', async () => {
    fixture = await bootDispatcher();
    fixture.model.script({ kind: 'text', text: 'ok' });
    const opened = await fixture.open();
    await fixture.send(opened, 'hi');
    await fixture.finished(1);

    await fixture.control(opened, 'close');

    expect(fixture.frames[0]).toMatchObject({ kind: 'open', session_id: opened.sessionId });
    expect(fixture.frames.at(-1)).toMatchObject({ kind: 'close', session_id: opened.sessionId });
    expect(kinds(fixture.frames).filter((kind) => kind === 'open')).toHaveLength(1);
  });

  it('names the session and writer epoch on every frame', async () => {
    fixture = await bootDispatcher();
    fixture.model.script({ kind: 'text', text: 'ok' });
    const opened = await fixture.open();
    await fixture.send(opened, 'hi');
    await fixture.finished(1);

    for (const frame of fixture.frames)
      expect(frame).toMatchObject({ session_id: opened.sessionId, epoch: opened.claim.epoch });
  });

  it('keeps the order in which the runtime produced things', async () => {
    fixture = await bootDispatcher();
    fixture.model.script({ kind: 'text', text: 'ok' });
    const opened = await fixture.open();
    await fixture.send(opened, 'hi');
    await fixture.finished(1);

    const order = kinds(fixture.frames);
    expect(order.indexOf('input')).toBeLessThan(order.indexOf('text'));
    const logged = fixture.persistence.events(opened.sessionId).map((event) => event.type);
    expect(logged.indexOf('turn/start')).toBeLessThan(logged.indexOf('turn/end'));
    expect(fixture.frames.at(-1)).toMatchObject({ kind: 'status', status: 'idle' });
  });

  it('reports the end of a turn from the log it ended', async () => {
    fixture = await bootDispatcher();
    fixture.model.script({ kind: 'text', text: 'ok' });
    const opened = await fixture.open();
    await fixture.send(opened, 'hi');
    await fixture.finished(1);

    const end = fixture.persistence
      .events(opened.sessionId)
      .find((event) => event.type === 'turn/end');
    const completed = fixture.published.find((event) => event.kind === 'completed');
    expect(end?.seq).toBeDefined();
    expect(completed?.kind === 'completed' ? completed.durable_seq : -1).toBe(end?.seq);
  });

  it('never sends a copy of what it already stored in the log', async () => {
    fixture = await bootDispatcher();
    fixture.model.script({ kind: 'text', text: 'a long answer the hub already stores' });
    const opened = await fixture.open();
    await fixture.send(opened, 'hi');
    await fixture.finished(1);

    const copies = fixture.frames.filter(
      (frame) => frame.kind !== 'text' && JSON.stringify(frame).includes('a long answer'),
    );
    expect(copies).toStrictEqual([]);
  });

  it('shows a tool call and its result from the log', async () => {
    fixture = await bootDispatcher();
    fixture.model.script(
      {
        kind: 'tool',
        id: 'call-1',
        name: 'write',
        input: { file_path: `${fixture.directory}/home/n.txt`, content: 'x' },
      },
      { kind: 'text', text: 'Saved' },
    );
    const opened = await fixture.open();
    await fixture.send(opened, 'save');
    await fixture.finished(1);

    const states = fixture.published.flatMap((event) =>
      event.kind === 'tool' && event.call_id === 'call-1' ? [event.state] : [],
    );
    expect(states).toStrictEqual(['running', 'completed']);
  });
});

describe('the model attempts of a turn', () => {
  function attempts(frames: readonly HarnessNativeFrame[]): readonly string[] {
    return frames.flatMap((frame) => (frame.kind === 'attempt' ? [frame.state] : []));
  }

  it('are reported as started and committed when the reply settled', async () => {
    fixture = await bootDispatcher();
    fixture.model.script({ kind: 'text', text: 'ok' });
    const opened = await fixture.open();
    await fixture.send(opened, 'hi');
    await fixture.finished(1);

    expect(attempts(fixture.frames)).toStrictEqual(['started', 'committed']);
  });

  it('are reported as discarded when the turn was interrupted mid reply', async () => {
    fixture = await bootDispatcher();
    fixture.model.script({ kind: 'hang' });
    const opened = await fixture.open();
    await fixture.send(opened, 'think forever');
    await vi.waitFor(() => {
      expect(fixture?.model.requests).toHaveLength(1);
    });
    await fixture.control(opened, 'interrupt');
    await fixture.finished(1);

    expect(attempts(fixture.frames)).toStrictEqual(['started', 'discarded']);
  });

  it('carry the usage the model reported', async () => {
    fixture = await bootDispatcher();
    fixture.model.script({ kind: 'text', text: 'ok' });
    const opened = await fixture.open();
    await fixture.send(opened, 'hi');
    await fixture.finished(1);

    const usage = fixture.frames.find((frame) => frame.kind === 'usage');
    expect(usage?.kind === 'usage' ? usage.usage.outputTokens : -1).toBeGreaterThanOrEqual(0);
  });
});

describe('a turn the hub refused', () => {
  it('stops before the model is asked anything', async () => {
    fixture = await bootDispatcher(undefined, undefined, {
      intercept: (frame) => {
        if (frame.kind === 'input') throw new ApiError('command_refused', 'Not allowed.');
      },
    });
    fixture.model.script({ kind: 'text', text: 'never' });
    const opened = await fixture.open();

    await fixture.send(opened, 'hi');

    await vi.waitFor(() => {
      expect(fixture?.published.find((event) => event.kind === 'failed')).toBeDefined();
    });
    expect(fixture.model.requests).toHaveLength(0);
  });

  it('does not hold the next turn back', async () => {
    let refuse = true;
    fixture = await bootDispatcher(undefined, undefined, {
      intercept: (frame) => {
        if (frame.kind !== 'input' || !refuse) return;
        refuse = false;
        throw new ApiError('command_refused', 'Not allowed.');
      },
    });
    fixture.model.script({ kind: 'text', text: 'second' });
    const opened = await fixture.open();
    await fixture.send(opened, 'first');
    await vi.waitFor(() => {
      expect(fixture?.published.find((event) => event.kind === 'failed')).toBeDefined();
    });

    await fixture.send(opened, 'again');
    await fixture.finished(1);

    expect(fixture.model.requests).toHaveLength(1);
  });
});

describe('a frame the hub rejected', () => {
  it('cannot keep a finished turn from being reported', async () => {
    fixture = await bootDispatcher(undefined, undefined, {
      intercept: (frame) => {
        if (frame.kind === 'status') throw new Error('hub unavailable');
      },
    });
    fixture.model.script({ kind: 'text', text: 'Hello there' });
    const opened = await fixture.open();

    await fixture.send(opened, 'hi');
    await fixture.finished(1);

    expect(fixture.published.find((event) => event.kind === 'failed')).toBeUndefined();
  });

  it('is dropped without losing the frames behind it', async () => {
    let rejected = false;
    fixture = await bootDispatcher(undefined, undefined, {
      intercept: (frame) => {
        if (frame.kind !== 'text' || rejected) return;
        rejected = true;
        throw new Error('hub unavailable');
      },
    });
    fixture.model.script({ kind: 'text', text: 'Hello there' });
    const opened = await fixture.open();

    await fixture.send(opened, 'hi');
    await fixture.finished(1);

    expect(rejected).toBe(true);
    expect(fixture.frames.at(-1)).toMatchObject({ kind: 'status', status: 'idle' });
  });
});

describe('a question that was waiting when the chat moved to another machine', () => {
  it('is published again on the new machine, and the answer reaches the AI', async () => {
    fixture = await bootDispatcher();
    fixture.model.script({
      kind: 'tool',
      id: 'ask-1',
      name: 'ask_user_question',
      input: {
        questions: [{ id: 'pick', question: 'Which folder?', options: [{ label: 'docs' }] }],
      },
    });
    const opened = await fixture.open();
    await fixture.send(opened, 'sort the files');
    await vi.waitFor(() => {
      expect(
        fixture?.frames.some((frame) => frame.kind === 'interactions' && frame.added !== null),
      ).toBe(true);
    });
    const interrupted = await fixture.control(opened, 'interrupt');
    await fixture.control(opened, 'close');
    expect(interrupted.interactions).toMatchObject([{ kind: 'question' }]);

    fixture.frames.length = 0;
    const again = await fixture.reattach(opened, interrupted.interactions ?? []);

    const added = fixture.frames.find(
      (frame) => frame.kind === 'interactions' && frame.added !== null,
    );
    expect(added).toMatchObject({ epoch: again.claim.epoch });
    fixture.model.script({ kind: 'text', text: 'docs it is' });
    await fixture.dispatcher.execute(crypto.randomUUID(), {
      kind: 'answer',
      session_id: opened.sessionId,
      expected_epoch: again.claim.epoch,
      answer: {
        operation_id: crypto.randomUUID(),
        interaction_id: added?.kind === 'interactions' ? (added.added?.id ?? '') : '',
        expected_epoch: again.claim.epoch,
        answer: { answers: [{ id: 'pick', selected: ['docs'] }] },
      },
    });
    await vi.waitFor(() => {
      expect(JSON.stringify(fixture?.model.requests.at(-1))).toContain('Which folder? docs');
    });
  });
});
