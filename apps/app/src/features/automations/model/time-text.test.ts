import { describe, expect, it } from 'vitest';
import { WEEKDAY_SHORT, WEEK_ORDER, offsetText, sentenceStart, weekdaysText } from './time-text';

describe('weekdaysText', () => {
  it('names the usual sets of days in words, whatever the order given', () => {
    expect(weekdaysText([0, 1, 2, 3, 4, 5, 6])).toBe('every day');
    expect(weekdaysText([5, 4, 3, 2, 1])).toBe('on weekdays');
    expect(weekdaysText([6, 0])).toBe('at weekends');
  });

  it('lists any other days from Monday to Sunday', () => {
    expect(weekdaysText([0, 3, 1])).toBe(
      `on ${WEEKDAY_SHORT[1]}, ${WEEKDAY_SHORT[3]}, ${WEEKDAY_SHORT[0]}`,
    );
    expect(weekdaysText([2])).toBe(`on ${WEEKDAY_SHORT[2]}`);
  });

  it('does not call a set weekdays when one of them is missing or extra', () => {
    expect(weekdaysText([1, 2, 3, 4])).not.toBe('on weekdays');
    expect(weekdaysText([1, 2, 3, 4, 5, 6])).not.toBe('on weekdays');
  });

  it('starts the week on Monday', () => {
    expect(WEEK_ORDER[0]).toBe(1);
    expect(WEEK_ORDER.at(-1)).toBe(0);
  });
});

describe('offsetText', () => {
  it('says at the event for no offset', () => {
    expect(offsetText('sunset', 0)).toBe('at sunset');
  });

  it('says how long before or after the event', () => {
    expect(offsetText('sunrise', -30)).toBe('30 min before sunrise');
    expect(offsetText('sunset', 90)).toBe('1 h 30 min after sunset');
  });
});

describe('sentenceStart', () => {
  it('capitalises the first letter only', () => {
    expect(sentenceStart('at sunset')).toBe('At sunset');
    expect(sentenceStart('')).toBe('');
  });
});
