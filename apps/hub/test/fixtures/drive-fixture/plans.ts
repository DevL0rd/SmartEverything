import type { DriveRootState } from '../../../../../packages/domain/src/drive/root';
import type { NonEmpty, Random } from './random';
import type { DriveFixturePerson, DriveFixtureSize } from './types';

export type People = readonly [DriveFixturePerson, DriveFixturePerson, DriveFixturePerson];

export interface RootPlan {
  readonly id: string;
  readonly label: string;
  readonly weight: number;
  readonly scope: 'home' | 'person';
  readonly owner: string | null;
  readonly state: DriveRootState;
  readonly reason: string | null;
  readonly versions: boolean;
  readonly adders: NonEmpty<string>;
  readonly conflicts: number;
  readonly placements: number;
}

type PlanFields = Omit<RootPlan, 'id'>;

const MIN_FILES_PER_ROOT = 6;

export function makePeople(random: Random): People {
  return [
    { id: random.uuid(), name: 'Alex', owner: true },
    { id: random.uuid(), name: 'Sam', owner: false },
    { id: random.uuid(), name: 'Robin', owner: false },
  ];
}

function makePlan(random: Random, fields: PlanFields): RootPlan {
  return { ...fields, id: random.uuid() };
}

function personalPlan(
  random: Random,
  person: DriveFixturePerson,
  fields: Pick<RootPlan, 'weight' | 'conflicts' | 'placements'> &
    Partial<Pick<RootPlan, 'state' | 'reason'>>,
): RootPlan {
  return makePlan(random, {
    state: 'ready',
    reason: null,
    ...fields,
    label: person.name,
    scope: 'person',
    owner: person.id,
    versions: true,
    adders: [person.id],
  });
}

export function planRoots(
  random: Random,
  people: People,
  size: DriveFixtureSize,
): readonly RootPlan[] {
  const [owner, sam, robin] = people;
  const populated = size !== 'empty';
  return [
    personalPlan(random, owner, { weight: 30, conflicts: 3, placements: 3 }),
    personalPlan(random, sam, {
      weight: 14,
      conflicts: 0,
      placements: 1,
      ...(populated ? { state: 'scanning' as const } : {}),
    }),
    personalPlan(random, robin, {
      weight: 10,
      conflicts: 0,
      placements: 1,
      ...(populated
        ? { state: 'unresponsive' as const, reason: 'The drive folder is not answering' }
        : {}),
    }),
    makePlan(random, {
      label: 'Shared',
      weight: 18,
      scope: 'home',
      owner: null,
      state: populated ? 'error' : 'ready',
      reason: populated ? 'Permission denied reading the folder' : null,
      versions: true,
      adders: [owner.id, sam.id, robin.id],
      conflicts: 2,
      placements: 2,
    }),
  ];
}

export function fileCount(plan: RootPlan, plans: readonly RootPlan[], total: number): number {
  if (total === 0) {
    return 0;
  }
  const weights = plans.reduce((sum, entry) => sum + entry.weight, 0);
  return Math.max(MIN_FILES_PER_ROOT, Math.round((total * plan.weight) / weights));
}
