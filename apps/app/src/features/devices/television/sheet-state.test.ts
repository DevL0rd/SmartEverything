import { describe, expect, it } from 'vitest';
import { sheetReducer, type TvSheet } from './sheet-state';

describe('television sheets', () => {
  it('opens one sheet at a time and replaces the one that was open', () => {
    const volume = sheetReducer(null, { type: 'open', kind: 'volume' });
    expect(sheetReducer(volume, { type: 'open', kind: 'inputs' })).toEqual({ kind: 'inputs' });
  });

  it('closes whichever sheet is open', () => {
    expect(sheetReducer({ kind: 'sleep' }, { type: 'close' })).toBeNull();
  });

  it('starts the number pad with the digit that opened it', () => {
    expect(sheetReducer(null, { type: 'open', kind: 'numpad', typed: '7' })).toEqual({
      kind: 'numpad',
      typed: '7',
    });
  });

  it('types at most four digits and erases from the end', () => {
    let sheet: TvSheet = sheetReducer(null, { type: 'open', kind: 'numpad' });
    for (const digit of '12345') {
      sheet = sheetReducer(sheet, { type: 'digit', digit });
    }
    expect(sheet).toEqual({ kind: 'numpad', typed: '1234' });
    expect(sheetReducer(sheet, { type: 'erase' })).toEqual({ kind: 'numpad', typed: '123' });
  });

  it('ignores digits and erasing while another sheet is open', () => {
    const inputs: TvSheet = { kind: 'inputs' };
    expect(sheetReducer(inputs, { type: 'digit', digit: '3' })).toBe(inputs);
    expect(sheetReducer(inputs, { type: 'erase' })).toBe(inputs);
    expect(sheetReducer(null, { type: 'digit', digit: '3' })).toBeNull();
  });
});
