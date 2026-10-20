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
