import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../components/toast-store', () => ({ notify: vi.fn() }));

const { withoutSent } = await import('./item-saves');

describe('changes left after a repeating item save', () => {
  it('drops only what was saved and keeps what was typed while the save was in flight', () => {
    const current = { title: 'Swim later', notes: 'Bring goggles' };
    expect(withoutSent(current, { title: 'Swim', notes: 'Bring goggles' })).toEqual({
      title: 'Swim later',
    });
    expect(withoutSent(current, current)).toEqual({});
  });
});
