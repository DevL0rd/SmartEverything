import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WindowColumn } from './night-bars-model';
import type { MixColumn } from './stage-mix-model';

vi.mock('../../design/colour', () => ({ useColour: (role: string): string => role }));

vi.mock('../use-measured-width', () => ({
  useMeasuredWidth: (): { width: number; onLayout: () => void } => ({
    width: 348,
    onLayout: (): void => undefined,
  }),
}));

const { SleepWindowBars } = await import('./sleep-window-bars');
const { StageMixBars } = await import('./stage-mix-bars');

const MONDAY = new Date(2026, 9, 19).getTime();
const DAY = 24 * 60 * 60_000;

function windows(nap: boolean): WindowColumn[] {
  return Array.from({ length: 7 }, (_, index) => ({
    key: `w${String(index)}`,
    at: MONDAY + index * DAY,
    night: index === 2 ? null : { bed: 23 * 60, wake: 7 * 60 + index * 10, asleepMinutes: 450 },
    nap: nap && index === 1 ? { start: 14 * 60, end: 14 * 60 + 30 } : null,
  }));
}

function mixes(unstaged: boolean): MixColumn[] {
  return Array.from({ length: 7 }, (_, index) => ({
    key: `m${String(index)}`,
    at: MONDAY + index * DAY,
    night:
      index === 2
        ? null
        : {
            asleep: 450,
            stages: unstaged && index === 3 ? null : { deep: 100, light: 250, rem: 100 },
          },
  }));
}

const USUAL = { bed: 23 * 60, wake: 7 * 60 };

function windowHtml(nap: boolean): string {
  return renderToStaticMarkup(
    createElement(SleepWindowBars, {
      columns: windows(nap),
      span: 'week',
      usual: USUAL,
      label: 'Sleep schedule',
    }),
  );
}

function mixHtml(unstaged: boolean): string {
  return renderToStaticMarkup(
    createElement(StageMixBars, {
      columns: mixes(unstaged),
      span: 'week',
      goal: 480,
      average: 450,
      label: 'Time asleep',
    }),
  );
}

describe('SleepWindowBars', () => {
  it('draws neutral bars, the usual labels and no stage colours', () => {
    const markup = windowHtml(false);
    expect(markup).toContain('sleep-asleep');
    expect(markup).toContain('Usual');
    expect(markup).toContain('Sleep schedule, 6 of 7 nights recorded.');
    for (const stage of ['sleep-deep', 'sleep-core', 'sleep-rem', 'sleep-awake']) {
      expect(markup).not.toContain(stage);
    }
  });

  it('shows the Nap legend only when a nap is drawn', () => {
    expect(windowHtml(true)).toContain('Nap');
    expect(windowHtml(false)).not.toContain('Nap');
  });

  it('is one adjustable element', () => {
    expect(windowHtml(false)).toContain('role="slider"');
  });
});

describe('StageMixBars', () => {
  it('draws the three stages, the goal and the average', () => {
    const markup = mixHtml(false);
    for (const role of ['sleep-deep', 'sleep-core', 'sleep-rem']) {
      expect(markup).toContain(role);
    }
    expect(markup).toContain('Goal 8h');
    expect(markup).toContain('Avg 7h 30m');
    expect(markup).toContain('–');
    expect(markup).not.toContain('sleep-asleep');
  });

  it('adds an Asleep swatch when a night has no stages', () => {
    const markup = mixHtml(true);
    expect(markup).toContain('sleep-asleep');
    expect(markup).toContain('Asleep');
  });
});
