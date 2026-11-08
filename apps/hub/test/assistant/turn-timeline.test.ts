import { describe, expect, it, vi } from 'vitest';
import { TurnTimeline } from '../../src/assistant/conversation/turn-timeline';

const MESSAGE = '6d0f4e0a-3b8c-4b61-9d5e-8c7a2f1b9e44';

describe('TurnTimeline steers', () => {
  it('puts a steer between the text before it and the text after it', () => {
    const timeline = new TurnTimeline();
    timeline.text('text', 'before');
    timeline.steer(MESSAGE);
    timeline.text('text', 'after');

    expect(timeline.current().parts.map((part) => part.kind)).toStrictEqual([
      'text',
      'steer',
      'text',
    ]);
    expect(timeline.current().parts[1]).toStrictEqual({
      kind: 'steer',
      key: `steer:${MESSAGE}`,
      message_id: MESSAGE,
    });
  });

  it('persists a steer on the next flush', () => {
    const timeline = new TurnTimeline();
    const persist = vi.fn();
    timeline.bind(persist);
    timeline.steer(MESSAGE);
    timeline.flush();

    expect(persist).toHaveBeenCalledTimes(1);
  });
});

describe('durable message boundaries', () => {
  it('deduplicates the later provider steering acknowledgment', () => {
    const timeline = new TurnTimeline();
    timeline.steer(MESSAGE);
    timeline.text('text', 'Already resumed');
    timeline.steer(MESSAGE);
    expect(timeline.current().parts.map((part) => part.kind)).toEqual(['steer', 'text']);
  });

  it('preserves message boundaries and tool completion while discarding speculative text', () => {
    const timeline = new TurnTimeline();
    timeline.text('text', 'Committed');
    const checkpoint = timeline.current();
    timeline.text('text', ' speculative');
    const tool = {
      callId: 'tool-1',
      name: 'bash',
      title: 'Build',
      state: 'running',
      detail: null,
    } as const;
    timeline.tool(tool, {});
    timeline.steer(MESSAGE);
    timeline.text('text', ' speculative after');
    timeline.tool({ ...tool, state: 'done' }, { output: 'Done' });
    timeline.restore(checkpoint);
    timeline.text('text', 'Replacement');
    expect(timeline.current().parts.map((part) => part.kind)).toEqual([
      'text',
      'tool',
      'steer',
      'text',
    ]);
    expect(timeline.current().parts[0]).toMatchObject({ text: 'Committed' });
    expect(timeline.current().parts[1]).toMatchObject({
      tool: { callId: 'tool-1', state: 'done', output: 'Done' },
    });
    expect(timeline.current().parts[3]).toMatchObject({ text: 'Replacement' });
  });
});

describe('native replay boundary retention', () => {
  const saved = (before: string, after: string): TurnTimeline => {
    const timeline = new TurnTimeline();
    timeline.text('text', before);
    timeline.steer(MESSAGE);
    timeline.text('text', after);
    return timeline;
  };

  it('splits coalesced native replay text at the saved exact character boundary', () => {
    const original = saved('Before.', 'After.');
    const replay = new TurnTimeline();
    replay.text('text', 'Before.After.More.');
    replay.replayBoundaries(original.current());
    replay.steer(MESSAGE);
    expect(replay.current().parts).toEqual([
      { kind: 'text', key: 'text:0', text: 'Before.' },
      { kind: 'steer', key: `steer:${MESSAGE}`, message_id: MESSAGE },
      { kind: 'text', key: 'text:0#resume:7', text: 'After.More.' },
    ]);
  });

  it('keeps a saved tool boundary with the fresh terminal state and exactly one call', () => {
    const tool = {
      callId: 'call-1',
      name: 'bash',
      title: 'Build',
      state: 'running',
      detail: null,
    } as const;
    const original = new TurnTimeline();
    original.text('reasoning', 'Thinking');
    original.tool(tool, {});
    original.steer(MESSAGE);
    original.text('text', 'After');
    const replay = new TurnTimeline();
    replay.text('reasoning', 'Thinking');
    replay.tool({ ...tool, state: 'done' }, { output: 'done' });
    replay.text('text', 'AfterNew');
    replay.replayBoundaries(original.current());
    expect(replay.current().parts.map((part) => part.kind)).toEqual([
      'reasoning',
      'tool',
      'steer',
      'text',
    ]);
    expect(replay.current().parts[1]).toMatchObject({
      tool: { callId: 'call-1', state: 'done', output: 'done' },
    });
  });

  it('keeps committed messages before replacement content when speculative text was discarded', () => {
    const original = saved('Before. speculative', 'also speculative');
    const replay = new TurnTimeline();
    replay.text('text', 'Before. replacement');
    replay.replayBoundaries(original.current());
    expect(
      replay.current().parts.map((part) => (part.kind === 'text' ? part.text : part.kind)),
    ).toEqual(['Before. ', 'steer', 'replacement']);
  });

  it('retains successive markers when replay contains no surviving model output yet', () => {
    const original = saved('Discarded', 'More discarded');
    const second = '6d0f4e0a-3b8c-4b61-9d5e-8c7a2f1b9e45';
    original.steer(second);
    const replay = new TurnTimeline();
    replay.replayBoundaries(original.current());
    replay.text('text', 'New response');
    expect(replay.current().parts.map((part) => part.kind)).toEqual(['steer', 'steer', 'text']);
  });
});
