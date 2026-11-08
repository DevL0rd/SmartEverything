import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SCHEDULE_ROW, type ScheduleRow } from '@smarteverything/domain';
import { expect, it, vi } from 'vitest';
import type { ListRowProps } from '../../../components/list-row';
import { Screen, type ScreenProps } from '../../../components/screen';
import { ScheduledScreen } from './scheduled-screen';

const fixture = vi.hoisted(() => ({ rows: new Array<ScheduleRow>() }));
const AT = '2026-10-18T18:30:00.000Z';
const ID = '10000000-0000-4000-8000-000000000001';
const LABEL = 'Restore the hallway and porch lights after the evening fixture reminder ends';

vi.mock('./use-scheduled', () => ({
  useScheduledRows: (): readonly ScheduleRow[] => fixture.rows,
  useHomeZone: (): string => 'UTC',
}));
vi.mock('../../../components/screen', () => ({
  Screen: ({ children }: ScreenProps): ReactNode => children,
}));
vi.mock('../../../components/list-row', () => ({
  ListRow: ({ title, wrapTitle }: ListRowProps): ReactNode =>
    createElement('span', { 'data-title-wrap': wrapTitle }, title),
}));

it('uses the shared screen width for the one-off timers landing', () => {
  const landing = ScheduledScreen();
  if (!isValidElement<ScreenProps>(landing)) {
    throw new Error('Expected the scheduled landing to render a Screen element.');
  }
  expect(landing.type).toBe(Screen);
  expect(landing.props.maxWidth).toBeUndefined();
});

it.each(['scheduled', 'failed'] as const)('wraps a long name in the %s timer row', (state) => {
  const active = state === 'scheduled';
  fixture.rows = [
    SCHEDULE_ROW.parse({
      id: ID,
      profile_id: ID,
      client_id: null,
      via: 'app',
      label: LABEL,
      timing: { kind: 'at', at: AT },
      occurrences: [AT],
      steps: [{ kind: 'wait', seconds: 12 }],
      step_lines: ['Wait 12 seconds'],
      device_ids: [],
      state,
      next_at: active ? AT : null,
      occurrence: 0,
      step: 0,
      results: [],
      confirmed_at: null,
      confirmed_by: null,
      origin: null,
      created_at: AT,
      updated_at: AT,
      finished_at: active ? null : AT,
    }),
  ];
  try {
    const markup = renderToStaticMarkup(createElement(ScheduledScreen));
    expect(markup).toContain(`<span data-title-wrap="true">${LABEL}</span>`);
  } finally {
    fixture.rows = [];
  }
});
