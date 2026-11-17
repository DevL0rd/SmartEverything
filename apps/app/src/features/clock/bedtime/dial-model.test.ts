import { clockFormatOf } from '../../../format/clock-text';
import { describe, expect, it } from 'vitest';
import {
  angleOfMinute,
  dialSpokenOf,
  dialTicks,
  dialTimesOf,
  minuteOfAngle,
  movedTimes,
  nearestHandle,
  nightTimesOf,
  nudgedTimes,
  sleepArcOf,
  sleepLengthText,
  sleepMinutesOf,
  windDownArcOf,
} from './dial-model';

const NIGHT = dialTimesOf({ bed: '22:45', wake: '06:30' });

const H24 = clockFormatOf(true);
const H12 = clockFormatOf(false);

describe('the bedtime dial', () => {
  it('puts midnight at the top and noon at the bottom of a 24 hour face', () => {
    expect(angleOfMinute(0)).toBe(0);
    expect(angleOfMinute(6 * 60)).toBe(90);
    expect(angleOfMinute(12 * 60)).toBe(180);
    expect(angleOfMinute(24 * 60 + 30)).toBe(7.5);
  });

  it('turns a drag angle back into a time on the five minute grid', () => {
    expect(minuteOfAngle(90)).toBe(360);
    expect(minuteOfAngle(341.4)).toBe(22 * 60 + 45);
    expect(minuteOfAngle(-90)).toBe(18 * 60);
    expect(minuteOfAngle(359.9)).toBe(0);
  });

  it('measures the night across midnight and draws its arc from bed to wake', () => {
    expect(sleepMinutesOf(NIGHT)).toBe(465);
    expect(sleepArcOf(NIGHT)).toEqual({ start: 341.25, sweep: 116.25 });
    expect(sleepMinutesOf({ bed: 60, wake: 480 })).toBe(420);
    expect(sleepLengthText(465)).toBe('7 h 45 min');
    expect(sleepLengthText(480)).toBe('8 h');
    expect(sleepLengthText(40)).toBe('40 min');
  });

  it('draws wind-down right before bed and none when it is off', () => {
    expect(windDownArcOf(NIGHT, 45)).toEqual({ start: 330, sweep: 11.25 });
    expect(windDownArcOf(NIGHT, null)).toBeNull();
  });

  it('grabs the handle nearest to the pointer', () => {
    expect(nearestHandle(NIGHT, 335)).toBe('bed');
    expect(nearestHandle(NIGHT, 100)).toBe('wake');
    expect(nearestHandle(NIGHT, 10)).toBe('bed');
  });

  it('moves one handle and never lets bed and wake meet', () => {
    expect(movedTimes(NIGHT, 'bed', 23 * 60)).toEqual({ bed: 1380, wake: 390 });
    expect(movedTimes(NIGHT, 'wake', 7 * 60)).toEqual({ bed: 1365, wake: 420 });
    expect(movedTimes(NIGHT, 'bed', 390)).toEqual({ bed: 385, wake: 390 });
    expect(movedTimes(NIGHT, 'wake', 1365)).toEqual({ bed: 1365, wake: 1370 });
    expect(nudgedTimes(NIGHT, 'wake', -2)).toEqual({ bed: 1365, wake: 380 });
    expect(nightTimesOf({ bed: 1380, wake: 420 })).toEqual({ bed: '23:00', wake: '07:00' });
  });

  it('labels every sixth hour and speaks the whole night', () => {
    const labelled = dialTicks(H24).filter((tick) => tick.label !== null);
    expect(dialTicks(H24)).toHaveLength(24);
    expect(labelled.map((tick) => tick.label)).toEqual(['00', '06', '12', '18']);
    expect(dialSpokenOf(NIGHT, H24)).toBe('Bed 22:45, wake 06:30, 7 h 45 min in bed');
    const twelve = dialTicks(H12).filter((tick) => tick.label !== null);
    expect(twelve.map((tick) => tick.label?.split(' ')[0])).toEqual(['12', '6', '12', '6']);
    expect(dialSpokenOf(NIGHT, H12)).toMatch(
      /^Bed 10:45\s\S+, wake 6:30\s\S+, 7 h 45 min in bed$/u,
    );
  });
});
