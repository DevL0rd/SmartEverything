import { describe, expect, it } from 'vitest';
import type { ListeningSource, ListeningView } from '@smarteverything/domain';
import { patchedView, replacedSource } from './listening-patch';

function source(key: string, over: Partial<ListeningSource> = {}): ListeningSource {
  return {
    key,
    kind: 'phone',
    name: key,
    profileId: null,
    wake: true,
    transcribe: false,
    state: 'listening',
    writing: { state: 'off' },
    sensitivity: 'standard',
    changeable: true,
    claims: [],
    ...over,
  };
}

const VIEW: ListeningView = { sources: [source('a'), source('b')], last: null };

describe('optimistic listening changes', () => {
  it('flips only the named source', () => {
    const next = patchedView(VIEW, 'a', { wake: false });
    expect(next.sources.map((one) => one.wake)).toEqual([false, true]);
  });

  it('shows the power mode of a phone at once and leaves other sources alone', () => {
    const next = patchedView(VIEW, 'a', { power_mode: 'charging' });
    expect(next.sources.map((one) => one.power_mode)).toEqual(['charging', undefined]);
    expect(patchedView(VIEW, 'a', { wake: false }).sources[0]).not.toHaveProperty('power_mode');
  });

  it('shows writing down as on once the write-down switch is turned on', () => {
    const next = patchedView(VIEW, 'a', { transcribe: true });
    expect(next.sources[0]?.writing).toEqual({ state: 'on' });
  });

  it('keeps a paused writing state while the switch stays on', () => {
    const paused = {
      ...VIEW,
      sources: [
        source('a', { transcribe: true, writing: { state: 'paused', reason: 'cap_reached' } }),
      ],
    };
    expect(patchedView(paused, 'a', { wake: false }).sources[0]?.writing).toEqual({
      state: 'paused',
      reason: 'cap_reached',
    });
  });

  it('turns writing down off with the switch', () => {
    const on = { ...VIEW, sources: [source('a', { transcribe: true, writing: { state: 'on' } })] };
    expect(patchedView(on, 'a', { transcribe: false }).sources[0]?.writing).toEqual({
      state: 'off',
    });
  });

  it('takes the sensitivity the person picked', () => {
    expect(patchedView(VIEW, 'b', { sensitivity: 'highest' }).sources[1]?.sensitivity).toBe(
      'highest',
    );
  });

  it('replaces a source with the hub answer', () => {
    const answer = source('a', { wake: false, state: 'off' });
    expect(replacedSource(VIEW, answer).sources[0]).toBe(answer);
  });
});
