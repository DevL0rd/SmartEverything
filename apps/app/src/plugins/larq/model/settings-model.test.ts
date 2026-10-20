import { describe, expect, it } from 'vitest';
import {
  angleOfMinutes,
  calibrationLevels,
  clockOfMinutes,
  hexOfSwatch,
  minutesAtAngle,
  minutesOfClock,
  moved,
  nearestHandle,
  nudgeClock,
  quietLine,
  reminderLine,
  swatchOfHex,
  sweepOf,
  windowText,
} from './settings-model';
import { settingsOf } from './fixtures';

describe('settings dial', () => {
  it('turns a clock into minutes and back, with midnight as zero', () => {
    expect(minutesOfClock('08:30')).toBe(510);
    expect(minutesOfClock('00:00')).toBe(0);
    expect(clockOfMinutes(510)).toBe('08:30');
    expect(clockOfMinutes(-15)).toBe('23:45');
    expect(clockOfMinutes(1440 + 60)).toBe('01:00');
  });

  it('places a time on the 24 hour ring', () => {
    expect(angleOfMinutes(720)).toBe(180);
    expect(angleOfMinutes(360)).toBe(90);
  });

  it('snaps a touch to the nearest quarter hour', () => {
    expect(minutesAtAngle(90)).toBe(360);
    expect(minutesAtAngle(91.2)).toBe(360);
    expect(minutesAtAngle(-90)).toBe(1080);
    expect(minutesAtAngle(359.9)).toBe(0);
  });

  it('nudges by a quarter hour either way and wraps midnight', () => {
    expect(nudgeClock('08:00', 1)).toBe('08:15');
    expect(nudgeClock('00:00', -1)).toBe('23:45');
    expect(nudgeClock('23:45', 1)).toBe('00:00');
  });

  it('measures a window that crosses midnight', () => {
    expect(sweepOf({ from: '22:00', to: '07:00' })).toEqual({ start: 330, sweep: 135 });
    expect(sweepOf({ from: '08:00', to: '21:00' }).sweep).toBe(195);
    expect(sweepOf({ from: '08:00', to: '08:00' }).sweep).toBe(360);
  });

  it('moves the handle nearest to the touch', () => {
    const window = { from: '08:00', to: '21:00' };
    expect(nearestHandle(window, 500)).toBe('from');
    expect(nearestHandle(window, 1200)).toBe('to');
    expect(moved(window, 'from', 540)).toEqual({ from: '09:00', to: '21:00' });
    expect(moved(window, 'to', 1320)).toEqual({ from: '08:00', to: '22:00' });
  });
});

describe('settings wording', () => {
  it('describes the reminder and the quiet hours', () => {
    const view = settingsOf();
    expect(reminderLine(view.reminder)).toBe('Every 45 min, 08:00 to 21:00');
    expect(
      reminderLine({
        ...(view.reminder ?? { intervalMin: 0, from: '08:00', to: '21:00', colour: '#ffffff' }),
        state: 'off',
      }),
    ).toBe('Off');
    expect(reminderLine(null)).toBe('Not read from the bottle yet');
    expect(quietLine(view.quiet)).toBe('Automatic, 22:00 to 07:00');
    expect(quietLine(null)).toBe('Not read from the bottle yet');
    expect(windowText({ from: '01:00', to: '02:00' })).toBe('01:00 to 02:00');
  });

  it('names the colour of the ring and falls back to white', () => {
    expect(swatchOfHex('#46b8ff')).toBe('sky');
    expect(swatchOfHex('#123456')).toBe('white');
    expect(hexOfSwatch('rose')).toBe('#ff8fb1');
  });

  it('offers eleven calibration levels from near empty to full', () => {
    const levels = calibrationLevels(680);
    expect(levels).toHaveLength(11);
    expect(levels[0]).toBe(55);
    expect(levels.at(-1)).toBe(680);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });
});
