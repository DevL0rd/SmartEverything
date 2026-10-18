import { describe, expect, it } from 'vitest';
import type { Turn } from './chat-turns';
import { emptyState, type StoreState } from './state';
import { changedSlices, trackReads, workingTurns } from './subscriptions';

function turn(chatId: string, state: Turn['state'], text: string, steps: string[] = []): Turn {
  return {
    chatId,
    turnId: `turn-${chatId}`,
    messageId: null,
    state,
    seq: 1,
    text,
    reasoning: '',
    tools: [],
    steps,
    reason: null,
    behind: false,
    waiting: [],
  };
}

function withTurn(state: StoreState, next: Turn): StoreState {
  return { ...state, turns: { ...state.turns, [next.turnId]: next } };
}

const touchesWork = (before: StoreState, after: StoreState): boolean => {
  const { reads } = trackReads(before, (state) => workingTurns(state));
  return [...changedSlices(before, after)].some((slice) => reads.has(slice));
};

describe('the working-turns slice', () => {
  const idle = withTurn(emptyState(), turn('a', 'idle', ''));
  const working = withTurn(idle, turn('a', 'replying', ''));

  it('is untouched by streamed text of a working turn', () => {
    expect(touchesWork(working, withTurn(working, turn('a', 'replying', 'more text')))).toBe(false);
  });

  it('is touched when a turn starts, stops or changes its step', () => {
    expect(touchesWork(idle, working)).toBe(true);
    expect(touchesWork(working, idle)).toBe(true);
    expect(touchesWork(working, withTurn(working, turn('a', 'replying', '', ['Searching'])))).toBe(
      true,
    );
  });

  it('is touched when a working turn disappears', () => {
    expect(touchesWork(working, { ...working, turns: {} })).toBe(true);
  });
});
