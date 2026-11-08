import { Children, createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { SCHEDULE_ROW, type ScheduleRow } from '@smarteverything/domain';
import { gridLayoutOf } from '../../../components/grid-layout';
import { SEMANTIC_SIZES } from '../../../design/tokens';
import { ScheduleScreen } from './schedule-screen';

const measured = vi.hoisted(() => ({ width: 380, gap: 12 }));
const ID = '20000000-0000-4000-8000-000000000001';
const AT = '2026-10-14T12:00:00.000Z';

function pass({ children }: { readonly children?: ReactNode }): ReactNode {
  return children;
}

vi.mock('react-native', () => ({ View: pass }));
vi.mock('../../../app-shell/hrefs', () => ({
  href: { scheduledItem: (): string => '/scheduled/item' },
}));
vi.mock('../../../components/button', () => ({ Button: (): null => null }));
vi.mock('../../../components/card', () => ({ Card: pass }));
vi.mock('../../../components/date-nav', () => ({ DateNav: (): null => null }));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/interactive', () => ({ Interactive: pass }));
vi.mock('../../../components/page-header', () => ({ PageHeader: (): null => null }));
vi.mock('../../../components/screen', () => ({ Screen: pass }));
vi.mock('../../../components/text', () => ({ Text: pass }));
vi.mock('../../../components/grid', () => ({
  Grid: ({
    minItemWidth,
    maxColumns = 6,
    children,
  }: {
    readonly minItemWidth: number;
    readonly maxColumns?: number;
    readonly children: ReactNode;
  }): ReactNode =>
    createElement(
      'div',
      {
        'data-columns': gridLayoutOf({
          width: measured.width,
          minItemWidth,
          maxColumns,
          gap: 'grid',
          idiom: measured.gap === SEMANTIC_SIZES.touch.comfortable.gridGap ? 'touch' : 'pointer',
          density: 'comfortable',
        }).columns,
        'data-days': Children.count(children),
      },
      children,
    ),
}));
vi.mock('../../../store/clock', () => ({ useMinute: (): number => Date.now() }));
vi.mock('../../../store/selectors', () => ({
  useSettings: (): { time_zone: string; latitude: null; longitude: null } => ({
    time_zone: 'UTC',
    latitude: null,
    longitude: null,
  }),
}));
vi.mock('../data/use-automations', () => ({
  useAutomations: (): { readonly rows: readonly [] } => ({ rows: [] }),
}));
vi.mock('./use-scheduled', () => ({
  useScheduledRows: (): readonly ScheduleRow[] => [
    SCHEDULE_ROW.parse({
      id: ID,
      profile_id: ID,
      client_id: null,
      via: 'app',
      label: 'Turn off the hallway light',
      timing: { kind: 'at', at: AT },
      occurrences: [AT],
      steps: [{ kind: 'wait', seconds: 1 }],
      step_lines: [null],
      device_ids: [],
      state: 'scheduled',
      next_at: AT,
      occurrence: 0,
      step: 0,
      results: [],
      confirmed_at: null,
      confirmed_by: null,
      origin: null,
      created_at: AT,
      updated_at: AT,
      finished_at: null,
    }),
  ],
}));

it.each([
  { width: 380, gap: SEMANTIC_SIZES.touch.comfortable.gridGap, columns: 1 },
  { width: 752, gap: SEMANTIC_SIZES.pointer.comfortable.gridGap, columns: 3 },
  { width: 2736, gap: SEMANTIC_SIZES.pointer.comfortable.gridGap, columns: 7 },
])(
  'lays out all seven days in $columns columns within $width pixels',
  ({ width, gap, columns }) => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(AT));
      Object.assign(measured, { width, gap });
      const markup = renderToStaticMarkup(createElement(ScheduleScreen));
      expect(markup).toContain(`data-columns="${String(columns)}" data-days="7"`);
      expect(markup).toContain('Turn off the hallway light');
    } finally {
      vi.useRealTimers();
    }
  },
);
