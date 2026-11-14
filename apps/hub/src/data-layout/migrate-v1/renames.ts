import { readdir, rename as nodeRename, mkdir } from 'node:fs/promises';
import { dirname, posix } from 'node:path';
import { V1_NAMES } from '../layout';
import { LEGACY_NAMES } from '../legacy';
import { databaseSteps, groupDatabaseEntries, isDatabaseEntry } from './database-groups';
import { isHubStray } from './foreign';
import {
  absoluteIn,
  createJournal,
  LayoutMigrationError,
  markComplete,
  missingDirectories,
  readJournal,
  removeEmptyDirectory,
  replaceStep,
  type StepAt,
  statOrUndefined,
  type Journal,
  type NewStep,
  type RenameStep,
  type RmdirStep,
} from './journal';
import { backupsStagingSteps, overlapsStagedBackups } from './staging';

export type MoveEntry = (from: string, to: string) => Promise<void>;

export interface StepEvent {
  readonly phase: 'started' | 'renamed' | 'done';
  readonly index: number;
}

export interface RenameOptions {
  readonly rename?: MoveEntry;
  readonly observe?: (event: StepEvent) => Promise<void> | void;
}

export interface RenameReport {
  readonly steps: number;
  readonly orphans: readonly string[];
  readonly unclassified: readonly string[];
}

const L = LEGACY_NAMES;
const V = V1_NAMES;
const CURSOR = /^startup-journal-(.+)\.cursor$/;
const KEPT_IN_PLACE: readonly string[] = [
  L.marker,
  L.lock,
  L.tmp,
  'system',
  'home',
  'people',
  'cache',
];

function parentOf(name: (id: string) => string): string {
  return posix.dirname(name('x'));
}

function zip(
  legacy: Readonly<Record<string, string>>,
  current: Readonly<Record<string, string>>,
  keys?: readonly string[],
): readonly (readonly [string, string])[] {
  return Object.entries(legacy).flatMap(([key, from]) => {
    const to = current[key];
    return to === undefined || (keys !== undefined && !keys.includes(key))
      ? []
      : [[from, to] as const];
  });
}

const CHILD_MOVES: readonly (readonly [string, string])[] = [
  [L.cache.harness, V.cache.harness],
  [L.cache.codexInputs, V.cache.codexInputs],
  [L.cache.smartthingsCapabilities, V.cache.smartthingsCapabilities],
  [L.run.go2rtcConfig, V.run.go2rtcConfig],
];

const NAMED_MOVES: readonly (readonly [string, string])[] = [
  ...zip(L.cache, V.cache).filter(([from]) => !CHILD_MOVES.some(([child]) => child === from)),
  [parentOf(L.derived), parentOf(V.derived)],
  ...zip(L.run, V.run).filter(([from]) => !CHILD_MOVES.some(([child]) => child === from)),
  ...zip(L.keys, V.keys),
  ...zip(L.config, V.config),
  ...zip(L.logs, V.logs),
  ...zip(L.ai, V.ai, ['assistant', 'claude', 'codex', 'harness']),
  ...zip(L.developer, V.developer),
  ...zip(L.updates, V.updates),
  [L.home.drive, V.home.drive],
  [L.home.talk, V.home.talk],
  [L.home.homeMapScans, V.home.homeMapScans],
  [parentOf(L.recordings), parentOf(V.recordings)],
  [parentOf(L.provider), parentOf(V.provider)],
  [parentOf(L.plugin), parentOf(V.plugin)],
  [L.backups.releases, V.backups.releases],
];

const MEMBERS_DIRECTORY = parentOf(L.person.drive);
const EMPTIED_DIRECTORIES: readonly string[] = [
  posix.dirname(L.run.go2rtcConfig),
  MEMBERS_DIRECTORY,
  posix.dirname(MEMBERS_DIRECTORY),
];

function topSegment(path: string): string {
  return path.split('/')[0] ?? path;
}

function knownTopLevelNames(): ReadonlySet<string> {
  return new Set([
    ...CHILD_MOVES.map(([from]) => topSegment(from)),
    ...NAMED_MOVES.map(([from]) => topSegment(from)),
    topSegment(MEMBERS_DIRECTORY),
    L.backups.manual,
    ...KEPT_IN_PLACE,
    L.database.file,
  ]);
}

async function listDirectory(path: string): Promise<readonly string[]> {
  return (await statOrUndefined(path)) === undefined ? [] : readdir(path);
}

async function existingRenames(
  root: string,
  pairs: readonly (readonly [string, string])[],
): Promise<readonly NewStep[]> {
  const steps: NewStep[] = [];
  for (const [from, to] of pairs) {
    if ((await statOrUndefined(absoluteIn(root, from))) !== undefined) {
      steps.push({ kind: 'rename', from, to });
    }
  }
  return steps;
}

function cursorMoves(names: readonly string[]): readonly (readonly [string, string])[] {
  return names.flatMap((name) => {
    const deviceId = CURSOR.exec(name)?.[1];
    return deviceId === undefined ? [] : [[name, V.journalCursor(deviceId)] as const];
  });
}

async function memberMoves(root: string): Promise<readonly (readonly [string, string])[]> {
  const members = await listDirectory(absoluteIn(root, MEMBERS_DIRECTORY));
  return members.map((id) => [`${MEMBERS_DIRECTORY}/${id}`, V.person.drive(id)] as const);
}

function strayMoves(
  names: readonly string[],
  known: ReadonlySet<string>,
): { readonly orphans: readonly NewStep[]; readonly unclassified: readonly string[] } {
  const unknown = names.filter(
    (name) => !known.has(name) && !isDatabaseEntry(name) && !CURSOR.test(name),
  );
  const strays = unknown.filter((name) => isHubStray(name, known));
  return {
    orphans: strays.map((name): NewStep => ({
      kind: 'rename',
      from: name,
      to: `${V.migration.orphans}/${name}`,
    })),
    unclassified: unknown.filter((name) => !strays.includes(name)),
  };
}

async function emptiedSteps(root: string): Promise<readonly NewStep[]> {
  const steps: NewStep[] = [];
  for (const path of EMPTIED_DIRECTORIES) {
    if ((await statOrUndefined(absoluteIn(root, path))) !== undefined) {
      steps.push({ kind: 'rmdir', path });
    }
  }
  return steps;
}

async function nearestExisting(root: string, relative: string): Promise<string> {
  let current = dirname(relative);
  while (current !== '.' && (await statOrUndefined(absoluteIn(root, current))) === undefined) {
    current = dirname(current);
  }
  return current === '.' ? root : absoluteIn(root, current);
}

async function assertPlannable(root: string, steps: readonly NewStep[]): Promise<void> {
  const targets = new Set<string>();
  for (const step of steps) {
    if (step.kind !== 'rename') {
      continue;
    }
    if (targets.has(step.to)) {
      throw new LayoutMigrationError(`two layout steps would both write ${step.to}`);
    }
    targets.add(step.to);
    const occupied = (await statOrUndefined(absoluteIn(root, step.to))) !== undefined;
    if (occupied && !overlapsStagedBackups(step.to)) {
      throw new LayoutMigrationError(
        `${step.to} already exists, so ${step.from} cannot move there`,
      );
    }
    await assertSameVolume(root, step);
  }
}

async function assertSameVolume(
  root: string,
  step: Extract<NewStep, { kind: 'rename' }>,
): Promise<void> {
  const source = await statOrUndefined(absoluteIn(root, step.from));
  const anchor = await statOrUndefined(await nearestExisting(root, step.to));
  if (source !== undefined && anchor !== undefined && source.dev !== anchor.dev) {
    throw crossDevice(step.from, step.to);
  }
}

function crossDevice(from: string, to: string): LayoutMigrationError {
  return new LayoutMigrationError(
    `${from} and ${to} are on different volumes; layout v1 renames stay on one volume, so put the whole data folder on one volume`,
  );
}

export async function planRenames(
  root: string,
): Promise<{ readonly steps: readonly NewStep[]; readonly unclassified: readonly string[] }> {
  const names = await readdir(root);
  const strays = strayMoves(names, knownTopLevelNames());
  const legacyBackups = (await statOrUndefined(absoluteIn(root, L.backups.manual))) !== undefined;
  const pairs = [
    ...CHILD_MOVES,
    ...NAMED_MOVES,
    ...cursorMoves(names),
    ...(await memberMoves(root)),
  ];
  const steps: readonly NewStep[] = [
    ...backupsStagingSteps(legacyBackups),
    ...(await existingRenames(root, pairs)),
    ...databaseSteps(groupDatabaseEntries(names)),
    ...strays.orphans,
    ...(await emptiedSteps(root)),
  ];
  await assertPlannable(root, steps);
  return { steps, unclassified: strays.unclassified };
}

export async function moveEntry(
  rename: MoveEntry,
  from: string,
  to: string,
  labels: readonly [string, string],
): Promise<void> {
  try {
    await rename(from, to);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EXDEV') {
      throw crossDevice(labels[0], labels[1]);
    }
    throw error;
  }
}

async function runRename(at: StepAt, step: RenameStep, options: RenameOptions): Promise<Journal> {
  const { root, index } = at;
  const from = absoluteIn(root, step.from);
  const to = absoluteIn(root, step.to);
  const source = await statOrUndefined(from);
  const target = await statOrUndefined(to);
  if (source === undefined && target !== undefined) {
    return replaceStep(at, { ...step, status: 'done' });
  }
  if (source === undefined || target !== undefined) {
    throw new LayoutMigrationError(
      `cannot resume ${step.from} to ${step.to}: the tree no longer matches the journal`,
    );
  }
  const created =
    step.status === 'started'
      ? step.created
      : await missingDirectories(root, posix.dirname(step.to));
  const started = await replaceStep(at, { ...step, created, status: 'started' });
  await options.observe?.({ phase: 'started', index });
  await mkdir(dirname(to), { recursive: true });
  await moveEntry(options.rename ?? nodeRename, from, to, [step.from, step.to]);
  await options.observe?.({ phase: 'renamed', index });
  return replaceStep({ ...at, journal: started }, { ...step, created, status: 'done' });
}

async function runRmdir(at: StepAt, step: RmdirStep, options: RenameOptions): Promise<Journal> {
  const { root, index } = at;
  const started = await replaceStep(at, { ...step, status: 'started' });
  await options.observe?.({ phase: 'started', index });
  const existed = (await statOrUndefined(absoluteIn(root, step.path))) !== undefined;
  const removed = existed
    ? await removeEmptyDirectory(absoluteIn(root, step.path))
    : step.status === 'started';
  await options.observe?.({ phase: 'renamed', index });
  return replaceStep({ ...at, journal: started }, { ...step, removed, status: 'done' });
}

async function advance(
  root: string,
  journal: Journal,
  index: number,
  options: RenameOptions,
): Promise<Journal> {
  const step = journal.steps[index];
  if (step === undefined || step.status === 'done') {
    return journal;
  }
  const at: StepAt = { root, journal, index };
  const next =
    step.kind === 'rename' ? await runRename(at, step, options) : await runRmdir(at, step, options);
  await options.observe?.({ phase: 'done', index });
  return next;
}

function reportOf(journal: Journal): RenameReport {
  const orphans = journal.steps.flatMap((step) =>
    step.kind === 'rename' && step.to.startsWith(`${V.migration.orphans}/`) ? [step.from] : [],
  );
  return { steps: journal.steps.length, orphans, unclassified: journal.unclassified };
}

export async function runV1Renames(
  root: string,
  options: RenameOptions = {},
): Promise<RenameReport> {
  let journal = await readJournal(root);
  if (journal === undefined) {
    const plan = await planRenames(root);
    journal = await createJournal(root, plan.steps, plan.unclassified);
  }
  for (let index = 0; index < journal.steps.length && !journal.complete; index += 1) {
    journal = await advance(root, journal, index, options);
  }
  if (!journal.complete) {
    journal = await markComplete(root, journal);
  }
  return reportOf(journal);
}
