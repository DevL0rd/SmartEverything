import { describe, expect, it, vi } from 'vitest';
import type { ListeningSource } from '@smarteverything/domain';
import { announceSupersededBy } from './superseded-notice';

const WINNER = { source: 'camera', key: 'kitchen' } as const;

function source(key: string, name: string): ListeningSource {
  return {
    key,
    kind: 'camera',
    name,
    profileId: null,
    wake: true,
    transcribe: false,
    state: 'listening',
    writing: { state: 'off' },
    sensitivity: null,
    changeable: true,
    claims: [],
  };
}

describe('announceSupersededBy', () => {
  it('shows the name of the source that answered', async () => {
    const show = vi.fn();
    await announceSupersededBy(
      WINNER,
      () =>
        Promise.resolve([source('hall', 'Hallway camera'), source('kitchen', 'Kitchen camera')]),
      show,
    );
    expect(show).toHaveBeenCalledExactlyOnceWith('Kitchen camera');
  });

  it('shows the kind of source when the names cannot be read', async () => {
    const show = vi.fn();
    await announceSupersededBy(WINNER, () => Promise.reject(new Error('offline')), show);
    expect(show).toHaveBeenCalledExactlyOnceWith('A camera');
  });
});
