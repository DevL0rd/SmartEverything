import { describe, expect, it } from 'vitest';
import type { DeviceLogEntry } from '@smarteverything/domain';
import {
  CAUSE_LOOKS,
  LOG_PAGE_SIZE,
  causeText,
  effectText,
  nextLogCursor,
  pageTime,
  tickerText,
  tickerTone,
} from './log-model';

const AUTOMATION = '00000000-0000-4000-8000-000000000009';
const NOW = Date.parse('2026-10-18T12:00:00.000Z');

function entry(patch: Partial<DeviceLogEntry>): DeviceLogEntry {
  return {
    at: '2026-10-18T11:02:00.000Z',
    kind: 'change',
    title: 'Turned on',
    cause: { kind: 'app', name: 'Dana' },
    ...patch,
  };
}

describe('the log cause', () => {
  it('names the cause and the person or automation behind it', () => {
    expect(causeText({ kind: 'app', name: 'Dana' })).toBe('App · Dana');
    expect(causeText({ kind: 'device' })).toBe('On the device');
    expect(causeText({ kind: 'unknown' })).toBe('Outside SmartEverything');
  });

  it('has a look for every cause kind the hub can send', () => {
    expect(Object.keys(CAUSE_LOOKS).sort()).toEqual(
      ['app', 'assistant', 'automation', 'button', 'device', 'schedule', 'unknown'].sort(),
    );
  });
});

describe('the card ticker line', () => {
  it('says what changed and who did it', () => {
    expect(tickerText(entry({}))).toBe('Turned on · App · Dana');
  });

  it('shows the first thing a press did instead of the cause', () => {
    const pressed = entry({
      kind: 'press',
      title: 'Pressed',
      cause: { kind: 'button' },
      effects: [{ title: 'Kitchen brighter', automationId: AUTOMATION, outcome: 'ok' }],
    });
    expect(tickerText(pressed)).toBe('Pressed · Kitchen brighter');
    expect(tickerTone(pressed)).toBe('variant');
  });

  it('turns critical when something a press triggered failed', () => {
    const pressed = entry({
      kind: 'press',
      title: 'Pressed',
      cause: { kind: 'button' },
      effects: [{ title: 'Living room off', automationId: AUTOMATION, outcome: 'failed' }],
    });
    expect(tickerText(pressed)).toBe('Pressed · Living room off · failed');
    expect(tickerTone(pressed)).toBe('critical');
  });

  it('keeps cycle titles as they are', () => {
    expect(tickerText(entry({ kind: 'cycle', title: 'Cooking finished' }))).toBe(
      'Cooking finished',
    );
  });

  it('words every effect outcome', () => {
    const base = { title: 'Lights', automationId: AUTOMATION } as const;
    expect(effectText({ ...base, outcome: 'ok' })).toBe('Lights');
    expect(effectText({ ...base, outcome: 'skipped' })).toBe('Lights · skipped');
    expect(effectText({ ...base, outcome: 'running' })).toBe('Lights · running');
  });
});

describe('the page time', () => {
  it('counts minutes for the first hour, then shows the clock', () => {
    expect(pageTime('2026-10-18T11:59:30.000Z', NOW)).toBe('Now');
    expect(pageTime('2026-10-18T11:48:00.000Z', NOW)).toBe('12 min');
    expect(pageTime('2026-10-18T09:00:00.000Z', NOW)).toMatch(/\d{1,2}:\d{2}/);
  });

  it('adds the day for earlier days', () => {
    expect(pageTime('2026-10-16T09:00:00.000Z', NOW)).toMatch(/^\D+ .*\d{1,2}:\d{2}/);
  });
});

describe('paging', () => {
  it('continues from the oldest entry while pages come back full', () => {
    const full = Array.from({ length: LOG_PAGE_SIZE }, (_, index) =>
      entry({ at: new Date(NOW - index * 60_000).toISOString() }),
    );
    expect(nextLogCursor(full)).toBe(full.at(-1)?.at);
    expect(nextLogCursor(full.slice(1))).toBeUndefined();
    expect(nextLogCursor([])).toBeUndefined();
  });
});
