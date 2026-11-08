import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Idiom } from '../../../design/tokens';
import { clock } from '../../../format/time';
import type { ActivityItem } from '../model/coalesce';

const state = vi.hoisted(() => ({
  idiom: vi.fn<() => Idiom>(),
  text: new Array<{ readonly children: ReactNode; readonly numberOfLines: number }>(),
}));

vi.mock('react-native', () => ({
  View: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('../../../app-shell/hrefs', () => ({ href: {} }));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/interactive', () => ({ Interactive: (): null => null }));
vi.mock('../../../components/text', () => ({
  Text: (props: (typeof state.text)[number]): null => {
    state.text.push(props);
    return null;
  },
}));
vi.mock('../../../design/platform', () => ({ useIdiom: state.idiom }));
vi.mock('../../../store/clock', () => ({ useMinute: (): number => Date.parse(AT) }));
vi.mock('../../../store/selectors', () => ({
  useSettings: (): { readonly time_zone: string } => ({ time_zone: 'UTC' }),
  useRow: (): null => null,
}));

const { ActivityRow } = await import('./activity-row');

const AT = '2026-11-06T03:00:00.000Z';
const ITEM: ActivityItem = {
  id: 'fixture-fault',
  at: AT,
  since: AT,
  deviceId: null,
  name: 'Workbench switch',
  summary: 'Relay reported a fault when switching the workbench circuit',
  by: null,
  icon: 'alert',
  tone: 'critical',
  category: 'devices',
  count: 1,
  failed: true,
};

function render(idiom: Idiom, timeline: boolean): void {
  state.idiom.mockReturnValue(idiom);
  state.text.length = 0;
  renderToStaticMarkup(createElement(ActivityRow, { item: ITEM, flush: true, timeline }));
}

describe('Activity timeline row', () => {
  it('shows the complete title and summary before the timestamp on touch', () => {
    render('touch', true);
    expect(state.text).toEqual([
      expect.objectContaining({ children: ITEM.name, numberOfLines: 0 }),
      expect.objectContaining({ children: ITEM.summary, numberOfLines: 0 }),
      expect.objectContaining({ children: clock(AT, 'UTC'), numberOfLines: 1 }),
    ]);
  });

  it('keeps the timestamp before the row text on a pointer timeline', () => {
    render('pointer', true);
    expect(state.text.map((entry) => entry.children)).toEqual([
      clock(AT, 'UTC'),
      ITEM.name,
      ITEM.summary,
    ]);
  });

  it('keeps the compact single-line content in widget rows', () => {
    render('pointer', false);
    expect(state.text.map((entry) => [entry.children, entry.numberOfLines])).toEqual([
      [ITEM.name, 1],
      [ITEM.summary, 1],
      [clock(AT, 'UTC'), 1],
    ]);
  });
});
