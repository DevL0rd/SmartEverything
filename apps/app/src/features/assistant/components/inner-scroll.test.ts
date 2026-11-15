import { describe, expect, it, vi } from 'vitest';
import { Gesture, type NativeGesture } from 'react-native-gesture-handler';

vi.mock('react-native-gesture-handler', () => ({
  Gesture: { Native: (): object => ({}) },
}));

const { yieldRegistry } = await import('./inner-scroll');

describe('the quote swipe yields to scrollers inside the message', () => {
  it('waits for every mounted inner scroller and forgets each one when it unmounts', () => {
    let list: NativeGesture[] = [];
    const yieldTo = yieldRegistry((update) => {
      list = update(list);
    });
    const table = Gesture.Native();
    const code = Gesture.Native();
    const dropTable = yieldTo(table);
    const dropCode = yieldTo(code);
    expect(list).toStrictEqual([table, code]);
    dropTable();
    expect(list).toStrictEqual([code]);
    dropCode();
    expect(list).toStrictEqual([]);
  });
});
