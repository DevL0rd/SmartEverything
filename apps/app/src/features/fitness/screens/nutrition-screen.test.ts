import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { FitnessFrameProps } from '../components/fitness-frame';
import { NutritionScreen } from './nutrition-screen';

const scenario = vi.hoisted(() => ({ started: false }));

vi.mock('expo-router', () => ({ useRouter: (): { push: () => void } => ({ push: vi.fn() }) }));
vi.mock('../../../app-shell/hrefs', () => ({ href: {} }));
vi.mock('../../nutrition', () => ({
  useNutritionStarted: (): boolean => scenario.started,
  NutritionDay: (): ReactNode => createElement('section', null, 'Nutrition day'),
}));
vi.mock('../components/fitness-frame', () => ({
  FitnessFrame: ({ width, primaryAction, children }: FitnessFrameProps): ReactNode =>
    createElement('main', { 'data-width': width, 'data-action': primaryAction?.label }, children),
}));
vi.mock('../components/fitness-toolbar', () => ({ FitnessToolbar: (): null => null }));
vi.mock('../data/day', () => ({
  useFitnessParams: (): {
    readonly day: string;
    readonly today: string;
    readonly range: 'day';
  } => ({
    day: '2026-11-06',
    today: '2026-11-06',
    range: 'day',
  }),
}));

describe('Nutrition screen frame', () => {
  it.each([false, true])('uses the available width when tracking has started: %s', (started) => {
    scenario.started = started;
    const markup = renderToStaticMarkup(createElement(NutritionScreen));

    expect(markup).toContain('data-width="dashboard"');
    expect(markup.includes('data-action="Add food"')).toBe(started);
    expect(markup).toContain('<section>Nutrition day</section>');
  });
});
