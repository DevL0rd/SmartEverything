import { describe, expect, it } from 'vitest';
import { continuedKeyOf } from './desktop-listing';

function chat(engine: { kind: string; continued_from?: string }): { engine: typeof engine } {
  return { engine };
}

describe('the key of Desktop sessions already continued in the app', () => {
  it('is the same string whatever else changes in the chats, so the list is not rebuilt', () => {
    const first = [
      chat({ kind: 'claude', continued_from: 'b' }),
      chat({ kind: 'dsh' }),
      chat({ kind: 'claude', continued_from: 'a' }),
    ];
    const second = [
      chat({ kind: 'claude', continued_from: 'a' }),
      chat({ kind: 'claude' }),
      chat({ kind: 'claude', continued_from: 'b' }),
    ];
    expect(continuedKeyOf(first)).toBe(continuedKeyOf(second));
  });

  it('changes when a chat starts continuing another Desktop session', () => {
    const before = [chat({ kind: 'claude', continued_from: 'a' })];
    const after = [...before, chat({ kind: 'claude', continued_from: 'c' })];
    expect(continuedKeyOf(after)).not.toBe(continuedKeyOf(before));
  });
});
