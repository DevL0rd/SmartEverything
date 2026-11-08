import type { DriveRoot, DriveRootState } from '../../../../../packages/domain/src/drive/root';
import type { NonEmpty, Random } from './random';
import type { DriveFixturePerson, DriveFixtureSize } from './types';

export type People = readonly [DriveFixturePerson, DriveFixturePerson, DriveFixturePerson];

export interface RootPlan {
  readonly id: string;
  readonly label: string;
  readonly kind: DriveRoot['kind'];
  readonly weight: number;
  readonly scope: 'home' | 'person';
  readonly owner: string | null;
  readonly state: DriveRootState;
  readonly reason: string | null;
  readonly readOnly: boolean;
  readonly versions: boolean;
  readonly synced: boolean;
  readonly inPhotos: boolean;
  readonly path: string;
  readonly adders: NonEmpty<string> | null;
  readonly clients: number;
  readonly conflicts: number;
  readonly remote: boolean;
}

type PlanFields = Partial<Omit<RootPlan, 'id'>> & Pick<RootPlan, 'label' | 'kind' | 'weight'>;

const DATA_DIR = '/var/lib/smarteverything';
const MIN_FILES_PER_ROOT = 6;

const DEFAULT_PLAN: Omit<RootPlan, 'id' | 'label' | 'kind' | 'weight'> = {
  scope: 'person',
  owner: null,
  state: 'ready',
  reason: null,
  readOnly: false,
  versions: false,
  synced: false,
  inPhotos: false,
  path: '',
  adders: null,
  clients: 0,
  conflicts: 0,
  remote: false,
};

export function makePeople(random: Random): People {
  return [
    { id: random.uuid(), name: 'Alex', owner: true },
    { id: random.uuid(), name: 'Sam', owner: false },
    { id: random.uuid(), name: 'Robin', owner: false },
  ];
}

function makePlan(random: Random, fields: PlanFields): RootPlan {
  return { ...DEFAULT_PLAN, ...fields, id: random.uuid() };
}

function memberPlan(
  random: Random,
  person: DriveFixturePerson,
  fields: Pick<RootPlan, 'weight' | 'clients' | 'conflicts'>,
): RootPlan {
  return makePlan(random, {
    ...fields,
    label: person.name,
    kind: 'managed',
    owner: person.id,
    versions: true,
    synced: true,
    path: `${DATA_DIR}/drive/Members/${person.id}`,
    adders: [person.id],
  });
}

function linkedPlan(random: Random, fields: PlanFields): RootPlan {
  return makePlan(random, { scope: 'home', readOnly: true, ...fields });
}

function remotePlan(random: Random, fields: PlanFields): RootPlan {
  return makePlan(random, { readOnly: true, remote: true, ...fields });
}

function managedPlans(random: Random, people: People): readonly RootPlan[] {
  const [owner, sam, robin] = people;
  return [
    memberPlan(random, owner, { weight: 30, clients: 3, conflicts: 3 }),
    memberPlan(random, sam, { weight: 14, clients: 1, conflicts: 0 }),
    memberPlan(random, robin, { weight: 10, clients: 1, conflicts: 0 }),
    makePlan(random, {
      label: 'Shared',
      kind: 'managed',
      weight: 18,
      scope: 'home',
      versions: true,
      synced: true,
      path: `${DATA_DIR}/drive/Shared`,
      adders: [owner.id, sam.id, robin.id],
      clients: 2,
      conflicts: 2,
    }),
  ];
}

function personalPlans(random: Random, people: People): readonly RootPlan[] {
  const [owner, sam] = people;
  return [
    makePlan(random, {
      label: 'Projects',
      kind: 'folder',
      weight: 6,
      owner: owner.id,
      versions: true,
      synced: true,
      path: '/home/alex/Projects',
      adders: [owner.id],
      clients: 2,
    }),
    makePlan(random, {
      label: 'Downloads',
      kind: 'folder',
      weight: 2,
      owner: sam.id,
      state: 'scanning',
      path: '/home/sam/Downloads',
    }),
  ];
}

function linkedPlans(random: Random): readonly RootPlan[] {
  return [
    linkedPlan(random, {
      label: 'Photo archive',
      kind: 'folder',
      weight: 12,
      inPhotos: true,
      path: '/mnt/archive/Photos',
    }),
    linkedPlan(random, {
      label: 'External disk',
      kind: 'volume',
      weight: 4,
      state: 'offline',
      reason: 'The volume is not mounted',
      path: '/run/media/alex/Backup',
    }),
    linkedPlan(random, {
      label: 'Media server',
      kind: 'folder',
      weight: 3,
      state: 'unresponsive',
      reason: 'The network share is not answering',
      path: '/mnt/nas/media',
    }),
    linkedPlan(random, {
      label: 'Old phone dump',
      kind: 'folder',
      weight: 1,
      state: 'error',
      reason: 'Permission denied reading the folder',
      path: '/mnt/old-phone',
    }),
  ];
}

function remotePlans(random: Random): readonly RootPlan[] {
  return [
    remotePlan(random, { label: 'Cameras', kind: 'cameras', weight: 2, scope: 'home' }),
    remotePlan(random, { label: 'Made with AI', kind: 'ai_images', weight: 1, scope: 'home' }),
  ];
}

export function planRoots(
  random: Random,
  people: People,
  size: DriveFixtureSize,
): readonly RootPlan[] {
  const managed = managedPlans(random, people);
  if (size === 'empty') {
    return managed;
  }
  return [
    ...managed,
    ...personalPlans(random, people),
    ...linkedPlans(random),
    ...remotePlans(random),
  ];
}

export function fileCount(plan: RootPlan, plans: readonly RootPlan[], total: number): number {
  if (total === 0) {
    return 0;
  }
  const weights = plans.reduce((sum, entry) => sum + entry.weight, 0);
  return Math.max(MIN_FILES_PER_ROOT, Math.round((total * plan.weight) / weights));
}
