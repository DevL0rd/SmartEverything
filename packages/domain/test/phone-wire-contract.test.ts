import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PHONE_DETAIL_SECTION_NAMES,
  PHONE_EVENT,
  PHONE_REPORT,
  PHONE_VALUES,
  splitPhoneDetail,
} from '../src';

const WIRE: unknown = JSON.parse(
  readFileSync(new URL('./fixtures/phone-wire.json', import.meta.url), 'utf8'),
);

function reportsOf(): readonly (readonly [string, unknown])[] {
  if (typeof WIRE !== 'object' || WIRE === null) throw new Error('the phone wire fixture is empty');
  return Object.entries(WIRE);
}

describe('what the phone sends', () => {
  it.each(reportsOf())('is a report the hub accepts whole: %s', (_name, report) => {
    expect(PHONE_REPORT.safeParse(report).success).toBe(true);
  });

  it.each(reportsOf())(
    'keeps every reported value, with none dropped by the hub: %s',
    (_name, raw) => {
      const report = PHONE_REPORT.parse(raw);
      expect(PHONE_VALUES.parse(report.values)).toEqual(report.values);
    },
  );

  it.each(reportsOf())('keeps every event whole: %s', (_name, raw) => {
    const report = PHONE_REPORT.parse(raw);
    report.events.forEach((event) => {
      expect(PHONE_EVENT.parse(event)).toEqual(event);
    });
  });

  it.each(reportsOf())(
    'carries every detail section in a form the hub accepts: %s',
    (_name, raw) => {
      const report = PHONE_REPORT.parse(raw);
      const split = splitPhoneDetail(report.detail ?? {});
      expect(split.invalid).toEqual([]);
      expect(Object.keys(split.update ?? {}).sort()).toEqual(
        [...PHONE_DETAIL_SECTION_NAMES].sort(),
      );
      expect(split.update).toEqual(report.detail);
    },
  );
});
