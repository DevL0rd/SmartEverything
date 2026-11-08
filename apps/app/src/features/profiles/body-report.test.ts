import type { ProfileRow } from '@smarteverything/domain';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WeighedReading } from '../../store/people';
import { BodyReport } from './body-report';

const state = vi.hoisted((): { profile: Pick<ProfileRow, 'sex' | 'birth_date' | 'height_cm'> } => ({
  profile: { sex: 'male', birth_date: '1990-01-01', height_cm: 172 },
}));

const moment = '2026-11-05T08:00:00.000Z';
const reading: WeighedReading = {
  id: '00000000-0000-4000-8000-000000000001',
  device_id: '00000000-0000-4000-8000-000000000002',
  profile_id: '00000000-0000-4000-8000-000000000003',
  measured_at: moment,
  weight_kg: 74.9,
  impedance_low: null,
  impedance_high: null,
  heart_rate: null,
  scale_user: null,
  attribution: 'only_profile',
  bmi: 25.3,
  composition: null,
  version: 1,
  saved_to_health_connect_at: null,
  created_at: moment,
  updated_at: moment,
};

vi.mock('react-native', () => ({ View: 'div' }));
vi.mock('../../components/card', () => ({
  Card: ({
    title,
    children,
  }: {
    readonly title: string;
    readonly children: ReactNode;
  }): ReactNode => createElement('section', {}, createElement('h2', {}, title), children),
}));
vi.mock('../../components/text', () => ({ Text: 'p' }));
vi.mock('../../components/figure', () => ({ Figure: (): null => null }));
vi.mock('../../store/clock', () => ({ useMinute: (): number => Date.parse(moment) }));
vi.mock('../../store/people', () => ({
  useActiveProfile: (): typeof state.profile => state.profile,
  useBodyReadings: (): readonly WeighedReading[] => [reading],
}));
vi.mock('./body-badges', () => ({ BodyBadges: (): null => null }));
vi.mock('./body-history', () => ({
  BodyHistory: (): ReactNode => createElement('h2', {}, 'History'),
}));
vi.mock('./composition-grid', () => ({ CompositionGrid: (): null => null }));
vi.mock('./fitness-ready', () => ({
  FinishFitnessCard: (): ReactNode => createElement('h2', {}, 'Finish setting up Fitness'),
}));

describe('body report for a weight-only reading', () => {
  it.each([
    { height: null, guidance: 'Finish setting up Fitness' },
    { height: 172, guidance: 'Body composition is unavailable for this weigh-in.' },
  ])('shows the guidance for profile height $height', ({ height, guidance }) => {
    state.profile = { ...state.profile, height_cm: height };
    const markup = renderToStaticMarkup(createElement(BodyReport));
    expect(markup).toContain(guidance);
    expect(markup).toContain('Latest weigh-in');
    expect(markup).toContain('History');
    expect(markup).not.toContain(
      height === null ? 'Body composition is unavailable' : 'Finish setting up Fitness',
    );
  });
});
