import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiHarnessInteraction } from '@smarteverything/domain';
import { ProcessInteractions } from '../src/process/interactions';
import { bootRuntime } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

const QUESTIONS = [
  {
    id: 'pick',
    question: 'Which folder?',
    options: [{ label: 'docs' }, { label: 'src' }],
  },
];

let fixture: RuntimeFixture | undefined;

afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

async function askedAndInterrupted(): Promise<{
  readonly sessionId: string;
  readonly cancelled: readonly AiHarnessInteraction[];
}> {
  const published: (AiHarnessInteraction | null)[] = [];
  const interactions = new ProcessInteractions(
    () => 1,
    (_id, interaction) => {
      published.push(interaction);
    },
  );
  fixture = await bootRuntime({ interactions });
  fixture.model.script(
    { kind: 'tool', id: 'ask-1', name: 'ask_user_question', input: { questions: QUESTIONS } },
    { kind: 'text', text: 'done' },
  );
  const options = fixture.sessionOptions();
  const session = await fixture.runtime.create(options);
  session.text('sort the files');
  await vi.waitFor(() => {
    expect(published.some((entry) => entry !== null)).toBe(true);
  });
  await session.interrupt();
  return { sessionId: options.sessionId, cancelled: interactions.takeCancelled(options.sessionId) };
}

describe('a question the AI was waiting on when the chat moves', () => {
  it('is handed back once by the interrupt that cancelled it', async () => {
    const { cancelled } = await askedAndInterrupted();

    expect(cancelled).toMatchObject([{ kind: 'question', request: { questions: QUESTIONS } }]);
  });

  it('is asked again on the new machine and the answer reaches the AI', () => {
    const published: (AiHarnessInteraction | null)[] = [];
    const steered: string[] = [];
    const interactions = new ProcessInteractions(
      () => 4,
      (_id, interaction) => {
        published.push(interaction);
      },
    );
    const asked: AiHarnessInteraction = {
      id: 'old-id',
      epoch: 1,
      kind: 'question',
      request: { questions: QUESTIONS },
    };

    interactions.restore('session-1', [asked], (text) => steered.push(text));

    const [again] = published;
    expect(again).toMatchObject({ epoch: 4, kind: 'question' });
    expect(again?.id).not.toBe('old-id');
    interactions.answer('session-1', {
      operation_id: crypto.randomUUID(),
      interaction_id: again?.id ?? '',
      expected_epoch: 4,
      answer: { answers: [{ id: 'pick', selected: ['docs'] }] },
    });
    expect(steered).toHaveLength(1);
    expect(steered[0]).toContain('Which folder? docs');
  });

  it('refuses an answer meant for the old machine epoch', () => {
    const published: (AiHarnessInteraction | null)[] = [];
    const interactions = new ProcessInteractions(
      () => 4,
      (_id, interaction) => {
        published.push(interaction);
      },
    );
    interactions.restore(
      'session-1',
      [{ id: 'old-id', epoch: 1, kind: 'question', request: { questions: QUESTIONS } }],
      () => undefined,
    );

    expect(() => {
      interactions.answer('session-1', {
        operation_id: crypto.randomUUID(),
        interaction_id: published[0]?.id ?? '',
        expected_epoch: 1,
        answer: { answers: [{ id: 'pick', selected: ['docs'] }] },
      });
    }).toThrow(/no longer pending/u);
  });

  it('tells the AI whether the person approved a tool that was waiting', () => {
    const published: (AiHarnessInteraction | null)[] = [];
    const steered: string[] = [];
    const interactions = new ProcessInteractions(
      () => 2,
      (_id, interaction) => {
        published.push(interaction);
      },
    );
    interactions.restore(
      'session-1',
      [{ id: 'old', epoch: 1, kind: 'permission', request: { tool_name: 'bash' } }],
      (text) => steered.push(text),
    );

    interactions.answer('session-1', {
      operation_id: crypto.randomUUID(),
      interaction_id: published[0]?.id ?? '',
      expected_epoch: 2,
      answer: 'allowed-once',
    });

    expect(steered[0]).toMatch(/approved bash/u);
  });
});
