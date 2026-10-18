import type { DeviceLogEntry } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  COOKED_STATE,
  agoText,
  cardChip,
  cookedCaptions,
  cookedSegments,
  factsLine,
  figureSpecs,
  blockedReason,
  leftWords,
  stateLine,
} from './card-model';
import { CYCLE_WINDOW, cycleRow, cyclesOf, HISTORY_CYCLES } from './cycles';
import type { RunPhase } from './run-model';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-10-18T12:00:00.000Z');

function cycle(startedAt: string, at: string, title = 'Cooking finished'): DeviceLogEntry {
  return {
    at,
    started_at: startedAt,
    kind: 'cycle',
    title,
    value: 'Air fry · 200 °C · 12 min',
    cause: { kind: 'device' },
  };
}

function line(phase: RunPhase, ago: number | null = null, lamp = false): string {
  return stateLine({ phase, settings: 'Convection · 180 °C', ago, lamp }, undefined);
}

describe('microwave card words', () => {
  it('marks cooking as information, paused as a warning and a finished meal as ready', () => {
    expect(cardChip({ phase: 'running' })).toEqual({ tone: 'info', label: 'Cooking' });
    expect(cardChip({ phase: 'paused' })).toEqual({ tone: 'warning', label: 'Paused' });
    expect(cardChip({ phase: 'ready' })).toEqual({ tone: 'positive', label: 'Ready' });
    expect(cardChip({ phase: 'door_open' }).tone).toBe('neutral');
    expect(cardChip({ phase: 'offline' }).label).toBe('Offline');
  });

  it('describes each state in the card line', () => {
    expect(line('running')).toBe('Convection · 180 °C');
    expect(line('door_open', null, true)).toBe('Door open · light on');
    expect(line('door_open')).toBe('Door open');
    expect(line('ready', 3)).toBe('Food is ready · 3 min ago');
    expect(line('ready', 0)).toBe('Food is ready · just now');
    expect(line('idle')).toBe('Door closed');
    expect(line('offline')).toBe('No cooking recorded yet');
  });

  it('keeps the last known cooking in the offline line, so the reason is said once', () => {
    const last = cycle('2026-10-18T11:10:00.000Z', '2026-10-18T11:22:00.000Z');
    expect(stateLine({ phase: 'offline', settings: null, ago: null, lamp: false }, last)).toMatch(
      /^Last: Air fry/u,
    );
  });

  it('lists the door, lamp, kids lock and draw on one line', () => {
    const base = { phase: 'running', lamp: true, locked: true, watts: 1180 } as const;
    expect(factsLine(base)).toBe('Door closed · Lamp on · Kids lock on · 1.2 kW');
    expect(factsLine({ ...base, phase: 'idle', lamp: false, locked: false })).toBe('Door closed');
    expect(factsLine({ ...base, phase: 'door_open' })).toMatch(/^Door open/u);
    expect(factsLine({ ...base, phase: 'offline' })).toBeNull();
  });

  it('shows whole minutes left with the ready time and the draw while cooking, and no figure when the food is ready', () => {
    const cooking = { phase: 'running', leftMinutes: 4, readyAt: '8:16 PM', watts: 1180 } as const;
    expect(figureSpecs(cooking, true)).toEqual([
      { key: 'left', value: '4', unit: 'min left', caption: 'ready 8:16 PM' },
      { key: 'draw', value: '1.2', unit: 'kW', caption: 'power' },
    ]);
    expect(figureSpecs({ ...cooking, leftMinutes: 0 }, true)[0]?.value).toBe('<1');
    expect(figureSpecs({ ...cooking, phase: 'paused' }, true)).toHaveLength(1);
    expect(figureSpecs({ ...cooking, phase: 'ready' }, true)).toEqual([]);
    expect(figureSpecs({ ...cooking, phase: 'idle', leftMinutes: null }, true)).toEqual([]);
  });

  it('leaves the captions out where the card has no room for them', () => {
    const cooking = { phase: 'running', leftMinutes: 4, readyAt: '8:16 PM', watts: 1180 } as const;
    expect(figureSpecs(cooking, false)).toEqual([
      { key: 'left', value: '4', unit: 'min left' },
      { key: 'draw', value: '1.2', unit: 'kW' },
    ]);
  });

  it('gives one reason for what blocks cooking, from one place', () => {
    expect(blockedReason({ phase: 'door_open', blocked: null })).toBe('Close the microwave door.');
    expect(
      blockedReason({ phase: 'idle', blocked: 'Turn on remote control on the microwave.' }),
    ).toBe('Turn on remote control on the microwave.');
    expect(blockedReason({ phase: 'running', blocked: 'x' })).toBeNull();
    expect(blockedReason({ phase: 'offline', blocked: null })).toBeNull();
  });

  it('says the minutes left for a screen reader and counts the cooked cycles', () => {
    expect(leftWords({ phase: 'running', leftMinutes: 4 })).toBe(' 4 minutes left.');
    expect(leftWords({ phase: 'paused', leftMinutes: 0 })).toBe(' Less than a minute left.');
    expect(leftWords({ phase: 'idle', leftMinutes: null })).toBe('');
    expect(cookedCaptions(1)).toEqual(['24 h ago', 'Cooked once', 'Now']);
    expect(cookedCaptions(3)[1]).toBe('Cooked 3 times');
  });

  it('shows what was cooked last when idle', () => {
    const last = cycle('2026-10-18T11:10:00.000Z', '2026-10-18T11:22:00.000Z');
    expect(stateLine({ phase: 'idle', settings: null, ago: null, lamp: false }, last)).toMatch(
      /^Last: Air fry · 200 °C · 12 min, \d{1,2}:\d{2}/u,
    );
    expect(agoText(1)).toBe('1 min ago');
  });
});

describe('cooking in the last day', () => {
  it('keeps the cycles that overlap the window and clips them to it', () => {
    const from = NOW - 24 * HOUR;
    const inside = cycle('2026-10-18T10:00:00.000Z', '2026-10-18T10:12:00.000Z');
    const straddling = cycle('2026-10-17T11:50:00.000Z', '2026-10-17T12:10:00.000Z');
    const before = cycle('2026-10-17T08:00:00.000Z', '2026-10-17T08:10:00.000Z');
    const segments = cookedSegments([inside, straddling, before], from, NOW);
    expect(segments).toEqual([
      {
        start: Date.parse(inside.started_at ?? ''),
        end: Date.parse(inside.at),
        state: COOKED_STATE,
      },
      { start: from, end: Date.parse(straddling.at), state: COOKED_STATE },
    ]);
  });
});

describe('cooking cycles from the device log', () => {
  it('keeps only cycles and fits ten on the page from the window it reads', () => {
    const change: DeviceLogEntry = {
      at: '2026-10-18T10:00:00.000Z',
      kind: 'change',
      title: 'Door opened',
      cause: { kind: 'device' },
    };
    const done = cycle('2026-10-18T10:00:00.000Z', '2026-10-18T10:12:00.000Z');
    expect(cyclesOf([change, done])).toEqual([done]);
    expect(HISTORY_CYCLES).toBeLessThanOrEqual(CYCLE_WINDOW);
  });

  it('tells a finished cycle from one stopped early', () => {
    const done = cycleRow(cycle('2026-10-18T10:00:00.000Z', '2026-10-18T10:12:00.000Z'), NOW);
    const stopped = cycleRow(
      cycle('2026-10-18T10:00:00.000Z', '2026-10-18T10:02:00.000Z', 'Stopped early'),
      NOW,
    );
    expect(done.finished).toBe(true);
    expect(stopped.finished).toBe(false);
    expect(done.what).toBe('Air fry · 200 °C · 12 min');
    expect(done.when).toMatch(
      /^(Today|Yesterday|\w+) \d{1,2}:\d{2}.* – \d{1,2}:\d{2}.* · 12 min$/u,
    );
    expect(stopped.when).toMatch(/ · 2 min$/u);
    expect(done.ended).toMatch(/^\d{1,2}:\d{2}/u);
  });
});
