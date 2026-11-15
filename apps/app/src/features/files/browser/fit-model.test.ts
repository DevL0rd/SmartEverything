import { describe, expect, it } from 'vitest';
import { fittingCount } from './fit-model';

describe('fitting selection actions on one row', () => {
  const ends = [120, 228, 326, 474];

  it('shows every action when they all fit', () => {
    expect(fittingCount({ ends, room: 600, moreSpan: 48 })).toBe(4);
    expect(fittingCount({ ends, room: 474, moreSpan: 48 })).toBe(4);
  });

  it('keeps room for the more button when some actions do not fit', () => {
    expect(fittingCount({ ends, room: 400, moreSpan: 48 })).toBe(3);
    expect(fittingCount({ ends, room: 360, moreSpan: 48 })).toBe(2);
  });

  it('moves every action into the more button when even one does not fit beside it', () => {
    expect(fittingCount({ ends, room: 100, moreSpan: 48 })).toBe(0);
  });

  it('shows every action while an action, the room or the more button is unmeasured', () => {
    expect(fittingCount({ ends: [120, undefined], room: 100, moreSpan: 48 })).toBe(2);
    expect(fittingCount({ ends, room: null, moreSpan: 48 })).toBe(4);
    expect(fittingCount({ ends, room: 100, moreSpan: undefined })).toBe(4);
  });
});
