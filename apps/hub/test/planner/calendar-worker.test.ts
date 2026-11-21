import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CalendarWorker } from '../../src/planner/ical/calendar-reader';
import { IcalParseError } from '../../src/planner/ical/model';
import { bundledCodecWorker } from '../support/codec-worker';
import { fixture, read, ZONE } from '../support/ical';
import { captureLogs, testLogger } from '../support/logs';
import { temporaryDirectory } from '../support/server';

let directory: { path: string; remove: () => Promise<void> };
let calendars: CalendarWorker;

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
  calendars = new CalendarWorker(await bundledCodecWorker(directory.path), testLogger('planner'));
});

afterEach(async () => {
  await calendars.close();
  await directory.remove();
});

describe('the calendar worker', () => {
  it('reads a calendar off the main thread into the same items as a read in place', async () => {
    for (const name of ['google.ics', 'outlook.ics', 'apple.ics']) {
      const text = fixture(name);
      await expect(calendars.read(text, { defaultZone: ZONE })).resolves.toStrictEqual(read(text));
    }
  });

  it('refuses text that is not iCalendar with the same parse error', async () => {
    const refused = calendars.read('garbage', { defaultZone: ZONE });
    await expect(refused).rejects.toBeInstanceOf(IcalParseError);
    await expect(refused).rejects.toThrow(/not a readable iCalendar/u);
  });
});
