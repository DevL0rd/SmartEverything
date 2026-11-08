import { describe, expect, it } from 'vitest';
import { optionSourceOf } from '@smarteverything/domain';
import { CAPABLE_ONLY, NONE_CAPABLE, filterNoteOf, pickerOptionsOf } from './reference-picker';

const LAMP = { id: 'lamp', label: 'Nursery lamp' };

describe('reference picker', () => {
  it('says the list is filtered only when it is and something is left', () => {
    expect(filterNoteOf(true, [LAMP], [])).toEqual({ reason: null, note: true });
    expect(filterNoteOf(false, [LAMP], [])).toEqual({ reason: null, note: false });
    expect(CAPABLE_ONLY).toContain('Only things that can do');
  });

  it('locks the picker with a reason when nothing can do what the step needs', () => {
    expect(filterNoteOf(true, [], [])).toEqual({ reason: NONE_CAPABLE, note: false });
    expect(filterNoteOf(true, [], ['gone'])).toEqual({ reason: null, note: false });
  });

  it('gives source rows the icon of what the source yields', () => {
    const rows = pickerOptionsOf(optionSourceOf('variables').yields, [
      { id: 'count', label: 'count', description: 'This run' },
    ]);
    expect(rows).toEqual([{ id: 'count', label: 'count', detail: 'This run', icon: 'box' }]);
    expect(pickerOptionsOf(optionSourceOf('values').yields, [LAMP])[0]?.icon).toBe('gauge');
  });
});
