import { TIME_ZONE } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { dayLabelOf } from '../../planner/calendar/month-model';
import {
  addedClock,
  canMove,
  citiesOf,
  cityOptionsOf,
  homePointOf,
  movedClock,
  pickableZones,
  removedClock,
  type WorldClock,
} from './cities';
import { daylightLineOf, daylightOf, spansOf, UNKNOWN_DAYLIGHT } from './daylight';
import {
  eventTextAt,
  hourCellsOf,
  hourShiftedBy,
  hourTimeOf,
  markerSummaryOf,
  minutePastOf,
  nextHourOf,
  toneAt,
  type HourPlan,
} from './find-a-time';
import { zonePointOf } from './zone-points';
import {
  dayWordOf,
  offsetMinutesAt,
  offsetText,
  offsetToHomeOf,
  weekdayNameOf,
} from './world-time';

const SATURDAY = Date.parse('2026-11-14T13:20:00Z');
const JUNE = Date.parse('2026-06-21T12:00:00Z');
const PLAN: HourPlan = {
  working: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
  dayStart: '06:00',
  dayEnd: '23:00',
};
const LONDON_FRIDAY = { day: '2026-11-13', zone: 'Europe/London' };
const clocks = (...zones: readonly string[]): readonly WorldClock[] =>
  zones.map((time_zone) => ({ time_zone, label: null }));

describe('world time', () => {
  it('reads a zone offset from UTC in minutes, including half hours', () => {
    expect(offsetMinutesAt(SATURDAY, 'Asia/Tokyo')).toBe(540);
    expect(offsetMinutesAt(SATURDAY, 'America/New_York')).toBe(-300);
    expect(offsetMinutesAt(SATURDAY, 'Asia/Kolkata')).toBe(330);
  });

  it('writes the difference to home as signed hours and minutes', () => {
    expect(offsetText(0)).toBe('Same time');
    expect(offsetText(60)).toBe('+1 h');
    expect(offsetText(-300)).toBe('-5 h');
    expect(offsetText(330)).toBe('+5 h 30 min');
    expect(offsetText(-570)).toBe('-9 h 30 min');
    expect(offsetToHomeOf(SATURDAY, 'Asia/Tokyo', 'Europe/London')).toBe('+9 h');
  });

  it('names the city day relative to the home day', () => {
    expect(dayWordOf(SATURDAY, 'Asia/Tokyo', 'Europe/London')).toBe('Today');
    expect(dayWordOf(SATURDAY, 'Australia/Sydney', 'Europe/London')).toBe('Tomorrow');
    expect(dayWordOf(SATURDAY, 'Europe/London', 'Pacific/Auckland')).toBe('Yesterday');
    expect(weekdayNameOf(SATURDAY, 'Australia/Sydney')).toBe('Sunday');
  });
});

describe('daylight', () => {
  it('places sunrise and sunset of the city on its own day', () => {
    const london = daylightOf(SATURDAY, 'Europe/London', zonePointOf('Europe/London'));
    expect(london.kind).toBe('sun');
    if (london.kind !== 'sun') return;
    expect(london.rise).toBe('07:15');
    expect(london.set).toBe('16:14');
    const [span] = london.spans;
    expect(span?.from).toBeGreaterThan(0.29);
    expect(span?.to).toBeLessThan(0.7);
    expect(daylightLineOf(london)).toBe(`Sunrise ${london.rise}, sunset ${london.set}`);
  });

  it('tells polar night from polar day', () => {
    const svalbard = zonePointOf('Arctic/Longyearbyen');
    expect(daylightOf(SATURDAY, 'Arctic/Longyearbyen', svalbard)).toEqual({
      kind: 'polar_night',
      spans: [],
    });
    expect(daylightOf(JUNE, 'Arctic/Longyearbyen', svalbard)).toEqual({
      kind: 'polar_day',
      spans: [{ from: 0, to: 1 }],
    });
  });

  it('shows no sun line without a location', () => {
    expect(daylightOf(SATURDAY, 'Europe/London', null)).toBe(UNKNOWN_DAYLIGHT);
    expect(daylightLineOf(UNKNOWN_DAYLIGHT)).toBeNull();
  });

  it('splits daylight that runs over local midnight', () => {
    expect(spansOf(0.2, 0.7)).toEqual([{ from: 0.2, to: 0.7 }]);
    expect(spansOf(0.9, 0.1)).toEqual([
      { from: 0, to: 0.1 },
      { from: 0.9, to: 1 },
    ]);
  });
});

describe('find a time', () => {
  it('tints working hours on working days, dims the night', () => {
    const cells = hourCellsOf('Europe/London', LONDON_FRIDAY, PLAN);
    expect(cells).toHaveLength(24);
    expect(cells[9]).toEqual({ hour: 9, label: '9', tone: 'work' });
    expect(cells[8]?.tone).toBe('day');
    expect(cells[17]?.tone).toBe('day');
    expect(cells[3]?.tone).toBe('night');
    expect(cells[23]?.tone).toBe('night');
  });

  it('reads each city at its own local hour and weekday', () => {
    const tokyo = hourCellsOf('Asia/Tokyo', LONDON_FRIDAY, PLAN);
    expect(tokyo[0]).toEqual({ hour: 0, label: '9', tone: 'work' });
    expect(tokyo[16]).toEqual({ hour: 16, label: '1', tone: 'night' });
    const saturday = Date.parse('2026-11-14T01:00:00Z');
    expect(toneAt(saturday, 'Asia/Tokyo', PLAN)).toBe('day');
    expect(hourCellsOf('Asia/Kolkata', LONDON_FRIDAY, PLAN)[0]?.label).toBe('5');
    expect(minutePastOf('Asia/Kolkata', LONDON_FRIDAY)).toBe(':30');
    expect(minutePastOf('Asia/Tokyo', LONDON_FRIDAY)).toBeNull();
  });

  it('sums up the marker hour for every city', () => {
    const places = [
      { name: 'London', zone: 'Europe/London', home: true },
      { name: 'New York', zone: 'America/New_York', home: false },
      { name: 'Tokyo', zone: 'Asia/Tokyo', home: false },
    ];
    expect(markerSummaryOf(places, 16, LONDON_FRIDAY)).toBe(
      '16:00 Home · 11:00 New York · 01:00 Tokyo, Saturday',
    );
    expect(hourTimeOf(16, LONDON_FRIDAY)).toBe('16:00');
  });

  it('writes an hour long event the composer reads in the home zone', () => {
    const day = dayLabelOf('2026-11-13', true);
    expect(eventTextAt(16, LONDON_FRIDAY)).toBe(`${day} 16:00 to 17:00`);
    expect(eventTextAt(23, LONDON_FRIDAY)).toBe(`${day} 23:00 to 00:00`);
  });

  it('starts at the next full home hour and stays inside the day', () => {
    expect(nextHourOf(SATURDAY, 'Europe/London')).toBe(14);
    expect(nextHourOf(Date.parse('2026-11-14T23:40:00Z'), 'Europe/London')).toBe(23);
    expect(hourShiftedBy(0, -1)).toBe(0);
    expect(hourShiftedBy(23, 1)).toBe(23);
  });
});

describe('world cities', () => {
  it('puts home first with the home location', () => {
    const point = homePointOf({ latitude: 51.5, longitude: -0.1 });
    const cities = citiesOf({ zone: 'Europe/London', point }, clocks('Asia/Tokyo'));
    expect(cities.map((city) => [city.key, city.name, city.home])).toEqual([
      ['home', 'London', true],
      ['world:Asia/Tokyo', 'Tokyo', false],
    ]);
    expect(cities[0]?.point).toEqual({ latitude: 51.5, longitude: -0.1 });
    expect(cities[1]?.point).toEqual(zonePointOf('Asia/Tokyo'));
    expect(homePointOf({ latitude: null, longitude: null })).toBeNull();
  });

  it('adds once, removes and reorders inside the list', () => {
    const list = clocks('Asia/Tokyo', 'America/New_York', 'Australia/Sydney');
    expect(addedClock(list, 'Asia/Tokyo')).toBe(list);
    expect(addedClock(list, 'Europe/Berlin').at(-1)).toEqual({
      time_zone: 'Europe/Berlin',
      label: null,
    });
    expect(removedClock(list, 'America/New_York').map((world) => world.time_zone)).toEqual([
      'Asia/Tokyo',
      'Australia/Sydney',
    ]);
    expect(movedClock(list, 'Australia/Sydney', -1).map((world) => world.time_zone)).toEqual([
      'Asia/Tokyo',
      'Australia/Sydney',
      'America/New_York',
    ]);
    expect(canMove(list, 'Asia/Tokyo', -1)).toBe(false);
    expect(canMove(list, 'Australia/Sydney', 1)).toBe(false);
    expect(canMove(list, 'Asia/Tokyo', 1)).toBe(true);
  });

  it('offers every valid zone not shown yet, by city name, with the offset', () => {
    const options = cityOptionsOf(
      ['Asia/Tokyo', 'America/New_York', 'Europe/Berlin'],
      ['Asia/Tokyo'],
      SATURDAY,
      'Europe/London',
    );
    expect(options).toEqual([
      { value: 'Europe/Berlin', label: 'Berlin', description: 'Europe · +1 h' },
      { value: 'America/New_York', label: 'New York', description: 'America · -5 h' },
    ]);
    const zones = pickableZones();
    expect(zones).toContain('Europe/London');
    expect(zones.every((zone) => TIME_ZONE.safeParse(zone).success)).toBe(true);
    expect(zones.every((zone) => zonePointOf(zone) !== null)).toBe(true);
  });

  it('knows the place of a zone under either of its names', () => {
    expect(zonePointOf('Asia/Calcutta')).toEqual(zonePointOf('Asia/Kolkata'));
    expect(zonePointOf('UTC')).toBeNull();
  });
});
