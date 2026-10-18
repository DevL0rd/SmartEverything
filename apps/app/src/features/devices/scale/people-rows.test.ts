import { describe, expect, it } from 'vitest';
import { NO_SLOT_TEXT, peopleRows, slotText } from './people-rows';
import { scaleReadingsOf } from './people';
import {
  ALEX,
  DANA,
  SCALE_DEVICE,
  daysAgo,
  profileOf,
  readingOf,
} from '../../../store/body-fixture';

const SAM = '00000000-0000-4000-8000-0000000000b3';
const GONE = '00000000-0000-4000-8000-0000000000b4';

describe('people on this scale', () => {
  it('names the slot and says when a person has none', () => {
    expect(slotText(2)).toBe('Slot 2');
    expect(slotText(null)).toBe(NO_SLOT_TEXT);
  });

  it('lists people with a slot or a weigh-in, the latest weigh-in first, and nobody else', () => {
    const profiles = [
      profileOf(DANA, 'Dana', 1),
      profileOf(ALEX, 'Alex', 2),
      profileOf(SAM, 'Sam', 3),
      profileOf(GONE, 'Guest', null),
    ];
    const { people } = scaleReadingsOf(
      [
        readingOf({ weight_kg: 88, measured_at: daysAgo(3) }),
        readingOf({ weight_kg: 74, measured_at: daysAgo(1), profile_id: ALEX }),
      ],
      profiles,
      SCALE_DEVICE,
    );
    expect(
      peopleRows(profiles, people).map((row) => [row.profile.name, row.slot, row.last?.kg ?? null]),
    ).toEqual([
      ['Alex', 'Slot 2', 74],
      ['Dana', 'Slot 1', 88],
      ['Sam', 'Slot 3', null],
    ]);
  });
});
