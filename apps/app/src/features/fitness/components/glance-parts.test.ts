import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/text', () => ({ Text: (): null => null }));

const { figureFitOf } = await import('./glance-parts');

const BODY_HEADLINE = { below: ['footnote', 'caption'], gap: 4 } as const;

describe('figureFitOf', () => {
  it('keeps the large figure when the headline fits the touch medium body', () => {
    expect(figureFitOf({ room: 87.33, idiom: 'touch', largest: 'l', ...BODY_HEADLINE })).toBe('l');
  });

  it('steps the figure down when the headline would spill out of the pointer medium body', () => {
    expect(figureFitOf({ room: 75.33, idiom: 'pointer', largest: 'l', ...BODY_HEADLINE })).toBe(
      'm',
    );
  });

  it('never starts above the largest size asked for', () => {
    expect(figureFitOf({ room: 500, idiom: 'touch', largest: 'm' })).toBe('m');
  });

  it('falls back to the smallest figure when nothing fits', () => {
    expect(figureFitOf({ room: 10, idiom: 'touch', largest: 'xl' })).toBe('s');
  });
});
