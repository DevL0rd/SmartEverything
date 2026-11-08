import { HEALTH_ENTRY_ROW, HEALTH_RECORD } from '@smarteverything/domain';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { ListRowProps } from '../../../components/list-row';
import { FoodEntryRow } from './entry-rows';
import { OtherApps } from './other-apps';

vi.mock('../../../components/confirm-store', () => ({ confirm: vi.fn() }));
vi.mock('../../../components/list-row', () => ({
  ListRow: ({ title, value, wrapTitle }: ListRowProps): ReactNode =>
    createElement('div', { 'data-title-wrap': wrapTitle }, title, ' ', value),
}));
vi.mock('../../../components/section', () => ({
  List: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('../../health-log', () => ({
  saveProblemOf: (): null => null,
  useEntryWrites: () => ({ remove: vi.fn() }),
  useRetryEntry: () => vi.fn(),
}));

const NAME = 'Roasted vegetables with lemon, chickpeas, toasted almonds and a long recipe name';
const DATE = '2026-10-10T07:00:00.000Z';
const NUTRITION = {
  name: NAME,
  mealType: 1,
  kilocalories: 200,
  kilocaloriesFromFat: null,
  grams: {},
};

it('wraps the full name and keeps the energy visible for a logged food', () => {
  const entry = HEALTH_ENTRY_ROW.parse({
    id: '00000000-0000-4000-8000-000000000001',
    profile_id: '00000000-0000-4000-8000-000000000002',
    record_type: 'Nutrition',
    start_time: DATE,
    end_time: DATE,
    zone_offset_seconds: 0,
    data: NUTRITION,
    food: null,
    version: 1,
    created_at: DATE,
    updated_at: DATE,
  });
  const markup = renderToStaticMarkup(createElement(FoodEntryRow, { entry, onEdit: vi.fn() }));
  expect(markup).toContain('data-title-wrap="true"');
  expect(markup).toContain(NAME);
  expect(markup).toContain('200 kcal');
});

it('wraps the full name and keeps the energy visible for an imported food', () => {
  const record = HEALTH_RECORD.parse({
    recordId: 'fixture-nutrition',
    type: 'Nutrition',
    startTime: DATE,
    endTime: DATE,
    zoneOffsetSeconds: 0,
    sourceApp: 'fixture.health',
    lastModified: DATE,
    data: NUTRITION,
  });
  if (record.type !== 'Nutrition') throw new Error('Expected a nutrition record');
  const markup = renderToStaticMarkup(createElement(OtherApps, { records: [record], counted: true }));
  expect(markup).toContain('data-title-wrap="true"');
  expect(markup).toContain(NAME);
  expect(markup).toContain('200 kcal');
});
