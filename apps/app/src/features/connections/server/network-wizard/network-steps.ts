import type { SetupFacts } from '../../../setup';

export type NetworkStepId = 'firewall' | 'reach' | 'address' | 'verify' | 'done';

export type Reach = 'home' | 'away';

export interface NetworkStep {
  readonly id: NetworkStepId;
  readonly title: string;
  readonly done: boolean;
}

type NetworkFacts = Pick<SetupFacts, 'firewall' | 'address'>;

export function networkSteps(facts: NetworkFacts, reach: Reach | null): readonly NetworkStep[] {
  const firewall: readonly NetworkStep[] =
    facts.firewall === 'none'
      ? []
      : [{ id: 'firewall', title: 'Firewall', done: facts.firewall === 'open' }];
  const away: readonly NetworkStep[] =
    reach === 'away'
      ? [
          { id: 'address', title: 'Address', done: facts.address !== 'none' },
          { id: 'verify', title: 'Check', done: facts.address === 'verified' },
        ]
      : [];
  return [
    ...firewall,
    { id: 'reach', title: 'Where', done: reach !== null },
    ...away,
    { id: 'done', title: 'Done', done: false },
  ];
}

export function openStep(steps: readonly NetworkStep[]): NetworkStepId {
  return steps.find((step) => !step.done)?.id ?? 'done';
}

export function stepAfter(steps: readonly NetworkStep[], id: NetworkStepId): NetworkStepId {
  const index = steps.findIndex((step) => step.id === id);
  return steps[index + 1]?.id ?? 'done';
}

export function stepBefore(steps: readonly NetworkStep[], id: NetworkStepId): NetworkStepId | null {
  const index = steps.findIndex((step) => step.id === id);
  return index > 0 ? (steps[index - 1]?.id ?? null) : null;
}
