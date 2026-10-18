import { describe, expect, it } from 'vitest';
import { dateFormat, dateTimeText, numberFormat, timeText } from './locale';

const MOMENT = new Date('2026-10-10T21:17:51.403Z');

describe('cached locale formatters', () => {
  it('match the Date and Number locale methods they replace', () => {
    expect(dateTimeText(MOMENT)).toBe(MOMENT.toLocaleString());
    expect(timeText(MOMENT)).toBe(MOMENT.toLocaleTimeString());
    expect(dateFormat({ day: 'numeric', month: 'short', timeZone: 'UTC' }).format(MOMENT)).toBe(
      MOMENT.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }),
    );
    expect(numberFormat().format(1234567)).toBe((1234567).toLocaleString());
  });

  it('builds one formatter per option set', () => {
    expect(dateFormat({ hour: 'numeric', timeZone: 'UTC' })).toBe(
      dateFormat({ hour: 'numeric', timeZone: 'UTC' }),
    );
    expect(numberFormat()).toBe(numberFormat({}));
  });
});
