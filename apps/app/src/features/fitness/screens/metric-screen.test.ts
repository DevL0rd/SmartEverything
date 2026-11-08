import type { HealthRecord } from '@smarteverything/domain';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ScreenProps } from '../../../components/screen';
import type { SeriesView } from '../data/series';
import { MetricScreen } from './metric-screen';

interface Children {
  readonly children: ReactNode;
}

const record: HealthRecord = {
  type: 'Steps',
  recordId: 'fixture-steps',
  startTime: '2026-11-06T06:00:00.000Z',
  endTime: '2026-11-06T07:00:00.000Z',
  zoneOffsetSeconds: 0,
  sourceApp: 'fixture.health',
  lastModified: '2026-11-06T07:00:00.000Z',
  data: { count: 120 },
};

const scenario = vi.hoisted(() => ({ showRecord: false, width: 0 }));

vi.mock('expo-router', () => ({
  useLocalSearchParams: (): { readonly metric: string } => ({ metric: 'steps' }),
}));
vi.mock('react-native', () => ({
  View: ({ className, children }: Children & { readonly className: string }): ReactNode =>
    createElement('div', { className }, children),
}));
vi.mock('../../../app-shell/hrefs', () => ({ href: {} }));
vi.mock('../../../components/empty-state', () => ({ EmptyState: (): null => null }));
vi.mock('../../../components/list-row', () => ({
  ListRow: ({
    title,
    wrapTitle,
    wrapSubtitle,
  }: {
    readonly title: string;
    readonly wrapTitle: boolean;
    readonly wrapSubtitle: boolean;
  }): ReactNode => createElement('p', { 'data-wrap': wrapTitle && wrapSubtitle }, title),
}));
vi.mock('../../../components/page-header', () => ({ PageHeader: (): null => null }));
vi.mock('../../../components/screen', () => ({
  Screen: ({ children, maxWidth }: ScreenProps): ReactNode =>
    createElement('main', { 'data-width': maxWidth }, children),
}));
vi.mock('../../../components/section', () => ({
  List: ({ title, children }: Children & { readonly title: string }): ReactNode =>
    createElement('section', null, createElement('h2', null, title), children),
}));
vi.mock('../../../components/use-measured-width', () => ({
  useMeasuredWidth: (): { width: number; onLayout: () => void } => ({
    width: scenario.width,
    onLayout: () => undefined,
  }),
}));
vi.mock('../../health-log', () => ({ logFormOf: (): null => null }));
vi.mock('../components/fitness-toolbar', () => ({
  FitnessToolbar: (): ReactNode => createElement('nav', null, 'Period'),
}));
vi.mock('../components/metric-section', () => ({
  MetricCard: (): ReactNode => createElement('figure', null, 'Steps chart'),
}));
vi.mock('../data/day', () => ({
  useFitnessParams: (): {
    readonly day: string;
    readonly today: string;
    readonly range: 'week';
  } => ({ day: '2026-11-06', today: '2026-11-06', range: 'week' }),
}));
vi.mock('../data/series', () => ({
  useSeries: (): Pick<SeriesView, 'records'> => ({ records: scenario.showRecord ? [record] : [] }),
}));

describe('fitness metric detail layout', () => {
  it.each([
    { width: 396, showRecord: true, split: false },
    { width: 1079, showRecord: true, split: false },
    { width: 1080, showRecord: true, split: true },
    { width: 1112, showRecord: false, split: false },
  ])(
    'uses the available chart width at $width with entries present: $showRecord',
    ({ width, showRecord, split }) => {
      scenario.showRecord = showRecord;
      scenario.width = width;
      const markup = renderToStaticMarkup(createElement(MetricScreen));

      expect(markup).toContain('<main><nav>Period</nav>');
      expect(markup).toContain(
        `<div class="min-w-0${split ? ' flex-2' : ''}"><figure>Steps chart</figure></div>`,
      );
      expect(markup.includes('<h2>Entries</h2>')).toBe(showRecord);
      expect(markup.includes('data-wrap="true"')).toBe(showRecord);
    },
  );
});
