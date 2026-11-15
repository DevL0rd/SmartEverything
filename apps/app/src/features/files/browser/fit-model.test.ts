import { describe, expect, it } from 'vitest';
import { endsOf, fittingCount } from './fit-model';

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

describe('the selection row on a 1440 desktop with three items picked', () => {
  const widths = [119, 122, 120, 90, 158, 152];

  it('adds the measured widths, padding included, into running ends', () => {
    expect(endsOf(widths)).toEqual([119, 241, 361, 451, 609, 761]);
  });

  it('keeps Make view only and Move to Trash behind More actions when they do not fit', () => {
    expect(fittingCount({ ends: endsOf(widths), room: 500, moreSpan: 40 })).toBe(4);
  });

  it('shows the danger action once there is room for every action', () => {
    expect(fittingCount({ ends: endsOf(widths), room: 761, moreSpan: 40 })).toBe(6);
  });
});
