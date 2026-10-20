import type { QuietSettings, ReminderSettings } from '@smarteverything/ble';
import {
  bottleClockOfSeconds,
  bottleHexOfChannels,
  type BottleQuiet,
  type BottleReminder,
} from '@smarteverything/domain';

const SECONDS_PER_MINUTE = 60;

const FIRMWARE_DEFAULT_COLOUR = '#ffffff';

export function reminderOfCap(read: ReminderSettings): BottleReminder {
  const { red, green, blue } = read.colour;
  return {
    state: read.state,
    intervalMin: Math.round(read.intervalSeconds / SECONDS_PER_MINUTE),
    from: bottleClockOfSeconds(read.startSeconds),
    to: bottleClockOfSeconds(read.stopSeconds),
    colour:
      red === 0 && green === 0 && blue === 0
        ? FIRMWARE_DEFAULT_COLOUR
        : bottleHexOfChannels({ red, green, blue }),
  };
}

export function quietOfCap(read: QuietSettings): BottleQuiet {
  return {
    state: read.state,
    from: bottleClockOfSeconds(read.startSeconds),
    to: bottleClockOfSeconds(read.stopSeconds),
    snoozeMin: read.snoozeMinutes,
  };
}
