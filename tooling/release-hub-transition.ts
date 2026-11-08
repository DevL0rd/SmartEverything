import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { env } from 'node:process';
import { z } from 'zod';
import {
  atomicWrite,
  bootstrapDirectory,
  layoutFromNames,
  LEGACY_NAMES,
  LOCATION_FILE,
  resolveHubRoot,
  V1_NAMES,
  writeLocation,
  type HubLayout as DataLayout,
} from '../apps/hub/src/data-layout/index.ts';
import {
  hubUnitText,
  HUB_UNIT_FILE,
  reloadUserManager,
  userUnitDirectory,
  writeHubUnit,
  type HubUnitSpec,
} from '../apps/hub/src/data-layout/unit.ts';
import { journalFile } from '../apps/hub/src/data-layout/migrate-v1/journal.ts';
import { reverseV1 } from '../apps/hub/src/data-layout/migrate-v1/reverse.ts';

const BACKUP_META_FILE = 'backup.json';
const TRANSITION_DIRECTORY = 'transition';
const TRANSITION_FILE = 'transition.json';

const BACKUP_META = z.strictObject({
  version: z.literal(1),
  layout: z.enum(['legacy', 'v1']),
});

const SAVED_TRANSITION = z.strictObject({
  version: z.literal(1),
  unit: z.boolean(),
  location: z.boolean(),
});

export interface TransitionEnvironment {
  readonly bootstrap: string;
  readonly unitDirectory: string;
  readonly reload: () => Promise<void>;
}

export interface Transition {
  readonly after: DataLayout;
  readonly unit: HubUnitSpec;
}

export interface RollbackScene {
  readonly backup: string;
  readonly undo: boolean;
  readonly problems: readonly string[];
}

export function legacyLayoutOf(root: string): DataLayout {
  return layoutFromNames(root, LEGACY_NAMES, env);
}

export function defaultLegacyRoot(): string {
  return join(homedir(), '.config', 'SmartEverything');
}

export function hasV1Marker(root: string): boolean {
  return existsSync(join(root, V1_NAMES.marker));
}

export function pointerExists(bootstrap: string): boolean {
  return existsSync(join(bootstrap, LOCATION_FILE));
}

export function writeBackupMeta(backup: string, root: string): void {
  const layout = hasV1Marker(root) ? 'v1' : 'legacy';
  writeFileSync(join(backup, BACKUP_META_FILE), JSON.stringify({ version: 1, layout }));
}

function backupLayoutOf(backup: string): 'legacy' | 'v1' {
  const file = join(backup, BACKUP_META_FILE);
  if (!existsSync(file)) return 'legacy';
  return BACKUP_META.parse(JSON.parse(readFileSync(file, 'utf8'))).layout;
}

function copyIfPresent(from: string, to: string): boolean {
  if (!existsSync(from)) return false;
  copyFileSync(from, to);
  return true;
}

export function saveTransition(backup: string, environment: TransitionEnvironment): void {
  const directory = join(backup, TRANSITION_DIRECTORY);
  mkdirSync(directory, { recursive: true });
  const saved = {
    version: 1,
    unit: copyIfPresent(
      join(environment.unitDirectory, HUB_UNIT_FILE),
      join(directory, HUB_UNIT_FILE),
    ),
    location: copyIfPresent(
      join(environment.bootstrap, LOCATION_FILE),
      join(directory, LOCATION_FILE),
    ),
  };
  writeFileSync(join(directory, TRANSITION_FILE), JSON.stringify(saved));
}

export async function applyTransition(
  transition: Transition,
  environment: TransitionEnvironment,
  root: string,
): Promise<void> {
  mkdirSync(dirname(transition.after.system.logs.service), { recursive: true });
  await writeLocation(environment.bootstrap, { root, rootId: randomUUID(), state: 'pending-v1' });
  await writeHubUnit(environment.unitDirectory, hubUnitText(transition.unit));
  await environment.reload();
}

export function locateBackup(root: string, backup: string): string {
  if (existsSync(backup)) return backup;
  const name = basename(backup);
  const candidates = [
    join(layoutFromNames(root, V1_NAMES, env).backups.releases, name),
    join(legacyLayoutOf(root).backups.releases, name),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? backup;
}

function undoProblems(backup: string, migrated: boolean, withDatabase: boolean): readonly string[] {
  return [
    ...(withDatabase || !migrated
      ? []
      : [
          'the backup predates data layout v1 and the data folder has migrated, so stored paths were rewritten; roll back with --with-database',
        ]),
    ...(existsSync(join(backup, TRANSITION_DIRECTORY, TRANSITION_FILE))
      ? []
      : [`${backup} holds no saved hub unit, so the unit of the old layout cannot be restored`]),
  ];
}

export function rollbackScene(
  root: string,
  backup: string,
  withDatabase: boolean,
  environment: TransitionEnvironment,
): RollbackScene {
  const located = locateBackup(root, backup);
  const predates = backupLayoutOf(located) === 'legacy';
  const migrated = predates && hasV1Marker(root);
  const undo = migrated || (predates && pointerExists(environment.bootstrap));
  return {
    backup: located,
    undo,
    problems: undo ? undoProblems(located, migrated, withDatabase) : [],
  };
}

export const CROSSING_STEPS = [
  'reverse the layout v1 renames in the data folder and remove its layout marker',
  'restore the saved hub unit and remove the data folder pointer',
  'reload the systemd user manager',
  'restore the old service and the database from the backup',
] as const;

async function restoreSavedFile(from: string, to: string, saved: boolean): Promise<void> {
  if (saved) await atomicWrite(to, readFileSync(from, 'utf8'));
  else rmSync(to, { force: true });
}

async function restoreTransition(
  backup: string,
  environment: TransitionEnvironment,
): Promise<void> {
  const directory = join(backup, TRANSITION_DIRECTORY);
  const saved = SAVED_TRANSITION.parse(
    JSON.parse(readFileSync(join(directory, TRANSITION_FILE), 'utf8')),
  );
  await restoreSavedFile(
    join(directory, HUB_UNIT_FILE),
    join(environment.unitDirectory, HUB_UNIT_FILE),
    saved.unit,
  );
  await restoreSavedFile(
    join(directory, LOCATION_FILE),
    join(environment.bootstrap, LOCATION_FILE),
    saved.location,
  );
  if (existsSync(environment.bootstrap) && readdirSync(environment.bootstrap).length === 0) {
    rmdirSync(environment.bootstrap);
  }
  await environment.reload();
}

function removeEmptyFolders(root: string, folder: string): void {
  if (folder === root || !folder.startsWith(root) || !existsSync(folder)) return;
  if (readdirSync(folder).length > 0) return;
  rmdirSync(folder);
  removeEmptyFolders(root, dirname(folder));
}

export async function undoV1(
  root: string,
  backup: string,
  environment: TransitionEnvironment,
): Promise<string> {
  if (existsSync(journalFile(root))) await reverseV1(root);
  rmSync(join(root, V1_NAMES.marker), { force: true });
  removeEmptyFolders(root, dirname(layoutFromNames(root, V1_NAMES, env).system.logs.service));
  const restored = locateBackup(root, backup);
  await restoreTransition(restored, environment);
  return restored;
}

export function environmentFrom(
  reload: () => Promise<void> = reloadUserManager,
): TransitionEnvironment {
  return { bootstrap: bootstrapDirectory(env), unitDirectory: userUnitDirectory(env), reload };
}

export async function releaseRoot(environment: TransitionEnvironment): Promise<string> {
  return pointerExists(environment.bootstrap)
    ? (await resolveHubRoot(env)).root
    : defaultLegacyRoot();
}
