import { describe, expect, it } from 'vitest';
import * as chrono from 'chrono-node';
import { HUB_MANIFEST, declaredVersion } from './contract-helpers';
import { installedVersion } from './versions';

const REFERENCE = new Date(2026, 10, 7, 10, 0, 0);

function parsed(text: string): readonly {
  readonly text: string;
  readonly date: Date;
  readonly hourKnown: boolean;
}[] {
  return chrono.parse(text, REFERENCE).map((result) => ({
    text: result.text,
    date: result.start.date(),
    hourKnown: result.start.isCertain('hour'),
  }));
}

describe('chrono-node contract', () => {
  it('is declared at the installed version by the hub', () => {
    expect(declaredVersion(HUB_MANIFEST, 'chrono-node')).toBe(installedVersion('chrono-node'));
  });

  it('reads "tomorrow 07:30" against the reference date in local time', () => {
    expect(parsed('tomorrow 07:30')).toEqual([
      { text: 'tomorrow 07:30', date: new Date(2026, 10, 8, 7, 30, 0), hourKnown: true },
    ]);
  });

  it('reads only the time of "every day 22:00" and leaves the repeat words to the caller', () => {
    expect(parsed('every day 22:00')).toEqual([
      { text: '22:00', date: new Date(2026, 10, 7, 22, 0, 0), hourKnown: true },
    ]);
  });

  it('reports where the match sits so the caller can strip it from the title', () => {
    const [result] = chrono.parse('brush teeth tomorrow 07:30', REFERENCE);
    expect(result?.index).toBe('brush teeth '.length);
    expect(result?.text).toBe('tomorrow 07:30');
  });

  it('returns nothing for text without a date', () => {
    expect(chrono.parse('brush teeth', REFERENCE)).toEqual([]);
  });
});
