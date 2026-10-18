import { describe, expect, it } from 'vitest';
import { Listeners } from '../src/listeners';

describe('a set of listeners', () => {
  it('tells every listener, and stops telling one that has left', () => {
    const listeners = new Listeners<number>();
    const first: number[] = [];
    const second: number[] = [];
    const leave = listeners.listen((value) => first.push(value));
    listeners.listen((value) => second.push(value));
    listeners.emit(1);
    leave();
    listeners.emit(2);
    expect(first).toEqual([1]);
    expect(second).toEqual([1, 2]);
  });

  it('lets a listener leave while it is being told', () => {
    const listeners = new Listeners<string>();
    const heard: string[] = [];
    const leave = listeners.listen((value) => {
      heard.push(value);
      leave();
    });
    listeners.emit('a');
    listeners.emit('b');
    expect(heard).toEqual(['a']);
  });
});
