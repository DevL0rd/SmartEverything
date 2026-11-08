import { describe, expect, it } from 'vitest';
import {
  MISSING_REASON,
  canPress,
  heldOf,
  inFamilies,
  matchOptions,
  spokenOf,
  summaryOf,
  toggled,
  withHeld,
  type PickerOption,
} from './option-picker-model';

const OPTIONS: readonly PickerOption[] = [
  { id: 'lamp', label: 'Nursery lamp', detail: 'Nursery' },
  { id: 'strip', label: 'Desk strip', detail: 'Office' },
  { id: 'fan', label: 'Ceiling fan', detail: 'Bedroom', unavailable: 'Cannot change brightness' },
];

describe('option picker model', () => {
  it('reads one id or a list of ids from a stored value', () => {
    expect(heldOf('lamp')).toEqual(['lamp']);
    expect(heldOf(['lamp', 3, '', 'strip'])).toEqual(['lamp', 'strip']);
    expect(heldOf('')).toEqual([]);
    expect(heldOf(undefined)).toEqual([]);
  });

  it('keeps a stored id that left the home as an unavailable row with a reason', () => {
    const rows = withHeld(OPTIONS, ['gone', 'lamp']);
    expect(rows).toHaveLength(4);
    expect(rows.at(-1)).toEqual({
      id: 'gone',
      label: 'Removed',
      detail: 'gone',
      unavailable: MISSING_REASON,
    });
  });

  it('searches label and detail with every word, at any list length', () => {
    expect(matchOptions(OPTIONS, 'office').map((row) => row.id)).toEqual(['strip']);
    expect(matchOptions(OPTIONS, 'lamp nursery').map((row) => row.id)).toEqual(['lamp']);
    expect(matchOptions(OPTIONS, 'lamp office')).toEqual([]);
    expect(matchOptions(OPTIONS.slice(0, 1), 'NURSERY')).toHaveLength(1);
    expect(matchOptions(OPTIONS, '   ')).toBe(OPTIONS);
  });

  it('keeps only devices of the families a port asks for', () => {
    const family = new Map([
      ['lamp', 'light'],
      ['strip', 'light'],
      ['fan', 'fan'],
    ]);
    const familyOf = (id: string): string | undefined => family.get(id);
    expect(inFamilies(OPTIONS, ['light'], familyOf).map((row) => row.id)).toEqual([
      'lamp',
      'strip',
    ]);
    expect(inFamilies(OPTIONS, ['vacuum'], familyOf)).toEqual([]);
    expect(inFamilies(OPTIONS, [], familyOf)).toBe(OPTIONS);
  });

  it('toggles ids for the several mode in pick order', () => {
    expect(toggled(['lamp'], 'strip')).toEqual(['lamp', 'strip']);
    expect(toggled(['lamp', 'strip'], 'lamp')).toEqual(['strip']);
  });

  it('blocks unavailable rows unless they are held, so they can still be removed', () => {
    const fan = OPTIONS[2];
    expect(fan === undefined ? null : canPress(fan, [])).toBe(false);
    expect(fan === undefined ? null : canPress(fan, ['fan'])).toBe(true);
  });

  it('summarises the choice on the trigger and speaks the reason', () => {
    expect(summaryOf(OPTIONS, [], 'Pick one')).toBe('Pick one');
    expect(summaryOf(OPTIONS, ['strip'], 'Pick one')).toBe('Desk strip');
    expect(summaryOf(OPTIONS, ['lamp', 'strip', 'fan'], 'Pick')).toBe('Nursery lamp and 2 more');
    expect(OPTIONS[2] === undefined ? '' : spokenOf(OPTIONS[2])).toBe(
      'Ceiling fan, Bedroom, Cannot change brightness',
    );
  });
});
