import { describe, expect, it } from 'vitest';
import { ASSISTANT_STEPS_KEPT } from '../src/assistant';
import type { ChatToolItem } from '../src/ai-chats';
import { settledSteps, toolOutcomes } from '../src/chat-steps';

let counter = 0;

function tool(name: string, state: ChatToolItem['state'], title = name): ChatToolItem {
  counter += 1;
  return { callId: `call-${String(counter)}`, name, title, state, detail: null };
}

describe('toolOutcomes', () => {
  it('keeps running and done as they are', () => {
    expect(toolOutcomes([tool('a', 'running'), tool('b', 'done')])).toStrictEqual([
      'running',
      'done',
    ]);
  });

  it('marks a failure as retried only when the same tool later succeeded', () => {
    const outcomes = toolOutcomes([
      tool('a', 'failed'),
      tool('b', 'failed'),
      tool('a', 'done'),
      tool('b', 'running'),
    ]);
    expect(outcomes).toStrictEqual(['retried', 'failed', 'done', 'running']);
  });

  it('does not count an earlier success as a recovery', () => {
    expect(toolOutcomes([tool('a', 'done'), tool('a', 'failed')])).toStrictEqual([
      'done',
      'failed',
    ]);
  });
});

describe('settledSteps', () => {
  it('settles a still-running tool as failed', () => {
    expect(settledSteps([tool('a', 'running', 'Lights')])).toStrictEqual([
      { title: 'Lights', outcome: 'failed' },
    ]);
  });

  it('merges neighbouring steps with one title into the worst outcome', () => {
    const steps = settledSteps([
      tool('a', 'done', 'Lights'),
      tool('a', 'failed', 'Lights'),
      tool('b', 'done', 'Lights'),
    ]);
    expect(steps).toStrictEqual([{ title: 'Lights', outcome: 'failed' }]);
  });

  it('merges done with retried into retried and keeps different titles apart', () => {
    const steps = settledSteps([
      tool('a', 'failed', 'Lights'),
      tool('a', 'done', 'Lights'),
      tool('b', 'done', 'Fan'),
      tool('a', 'done', 'Lights'),
    ]);
    expect(steps).toStrictEqual([
      { title: 'Lights', outcome: 'retried' },
      { title: 'Fan', outcome: 'done' },
      { title: 'Lights', outcome: 'done' },
    ]);
  });

  it('merges two plain successes with one title into one success', () => {
    expect(settledSteps([tool('a', 'done', 'Lights'), tool('b', 'done', 'Lights')])).toStrictEqual([
      { title: 'Lights', outcome: 'done' },
    ]);
  });

  it('keeps a later recovery as retried when an earlier step of the same title was fine', () => {
    const steps = settledSteps([
      tool('a', 'done', 'Lights'),
      tool('b', 'failed', 'Lights'),
      tool('b', 'done', 'Lights'),
    ]);
    expect(steps).toStrictEqual([{ title: 'Lights', outcome: 'retried' }]);
  });

  it('keeps only the most recent steps', () => {
    const tools = Array.from({ length: ASSISTANT_STEPS_KEPT + 5 }, (_, index) =>
      tool(`t${String(index)}`, 'done', `Step ${String(index)}`),
    );
    const steps = settledSteps(tools);
    expect(steps).toHaveLength(ASSISTANT_STEPS_KEPT);
    expect(steps[0]?.title).toBe('Step 5');
    expect(steps.at(-1)?.title).toBe(`Step ${String(ASSISTANT_STEPS_KEPT + 4)}`);
  });
});
