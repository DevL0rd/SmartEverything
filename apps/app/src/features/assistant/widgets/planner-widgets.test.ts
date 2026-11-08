import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  ScrollView: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('../../clock', () => ({ useHubOffline: (): boolean => false }));
vi.mock('../../planner/widgets/planner-cards', () => ({
  PlannerDayWidget: ({ day }: { readonly day?: string }): ReactNode =>
    createElement('p', {}, `day:${day ?? 'today'}`),
  PlannerItemWidget: ({ id }: { readonly id: string }): ReactNode =>
    createElement('p', {}, `item:${id}`),
}));
vi.mock('../../planner/widgets/clock-cards', () => ({
  PlannerAlarmWidget: ({ id }: { readonly id: string }): ReactNode =>
    createElement('p', {}, `alarm:${id}`),
  PlannerTimerWidget: ({ id }: { readonly id: string }): ReactNode =>
    createElement('p', {}, `timer:${id}`),
}));
vi.mock('../../planner', async () => ({
  PLANNER_WIDGETS: (await import('../../planner/widgets')).PLANNER_WIDGETS,
}));
vi.mock('../../cameras', () => ({ CAMERA_WIDGETS: [] }));
vi.mock('../../fitness', () => ({ FITNESS_WIDGETS: [] }));
vi.mock('../../home', () => ({ HOME_WIDGETS: [] }));
vi.mock('../../nutrition', () => ({ nutritionWidgets: (): readonly never[] => [] }));
vi.mock('./board-sources', () => ({
  definitionIn: (
    catalogue: readonly { readonly type: string }[],
    type: string,
  ): { readonly type: string } => {
    const entry = catalogue.find((value) => value.type === type);
    if (entry === undefined) throw new Error(`Missing widget ${type}`);
    return entry;
  },
}));

const { resolveWidget } = await import('./widget-sources');
const ID = '11111111-1111-4111-8111-111111111111';
const FRAME = { width: 380, height: 180, idiom: 'touch' } as const;

function render(view: 'day' | 'item' | 'alarm' | 'timer', day?: string): string {
  const widget = resolveWidget(
    'planner',
    { kind: 'planner', view, id: ID, ...(day === undefined ? {} : { day }) },
    () => null,
    [],
  );
  expect(widget.wide).toBe(true);
  expect(widget.definition.sizes.compact).toContain('W');
  return renderToStaticMarkup(
    widget.definition.render({ options: widget.options, size: 'W', editing: false, frame: FRAME }),
  );
}

describe('Planner chat widgets', () => {
  it('uses the existing Planner catalogue for every view and keeps its id and date', () => {
    expect(render('day', '2026-11-08')).toContain('day:2026-11-08');
    for (const view of ['item', 'alarm', 'timer'] as const)
      expect(render(view)).toContain(`${view}:${ID}`);
    expect(render('day')).toContain('day:today');
  });

  it('rejects missing entity ids before placing a widget in the lane', () => {
    for (const view of ['item', 'alarm', 'timer'] as const) {
      expect(() => resolveWidget('planner', { kind: 'planner', view }, () => null, [])).toThrow(
        /needs the id/,
      );
    }
    expect(
      resolveWidget('planner', { kind: 'planner', view: 'day' }, () => null, []).definition.type,
    ).toBe('planner-day');
  });
});
