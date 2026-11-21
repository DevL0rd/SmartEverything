import { UNSET_FITNESS_GOALS, type FitnessGoals } from '@smarteverything/domain';
import { vi } from 'vitest';
import { budgetCase, type Face } from './cell-budget';

vi.mock('../../queries/use-screen-query', () => ({
  useScreenQuery: (): { readonly data: undefined } => ({ data: undefined }),
}));

vi.mock('../../store/people', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useActiveProfile: (): { readonly id: string; readonly fitness_goals: FitnessGoals } => ({
    id: PROFILE,
    fitness_goals: UNSET_FITNESS_GOALS,
  }),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useMutation: (): { readonly isPending: false; readonly mutate: () => void } => ({
    isPending: false,
    mutate: (): void => undefined,
  }),
}));

const NOW = new Date().toISOString();
const PROFILE = '00000000-0000-4000-8000-0000000000aa';

const WATCH: Face = {
  name: 'watch',
  kind: 'other',
  model: 'miwear.watch.l66',
  specs: [],
  values: {},
  shown: ['signal_strength', 60],
  details: {
    provider: 'local',
    driver: 'xiaomi_watch',
    worn: true,
    profileId: PROFILE,
    battery: 55,
    heartRate: 80,
    steps: 4210,
    phase: 'connected',
    reportedAt: NOW,
    lastSyncAt: NOW,
  },
};

budgetCase('watch', WATCH, {
  S: { nodes: 43, hooks: 84, subscriptions: 13 },
  M: { nodes: 69, hooks: 120, subscriptions: 21 },
});
