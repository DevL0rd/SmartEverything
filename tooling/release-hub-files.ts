import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statfsSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { env } from 'node:process';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';

import {
  layoutFromNames,
  LEGACY_NAMES,
  V1_NAMES,
  type HubLayout as DataLayout,
} from '../apps/hub/src/data-layout/index.ts';
import {
  defaultHubInstall,
  desktopPayloadIn,
  HUB_SERVICE_DIRECTORY,
  HUB_SERVICE_ENTRY,
} from './hub-install-layout.ts';
import {
  hasV1Marker,
  hubUnitSpec,
  legacyLayoutOf,
  rollbackScene,
  writeBackupMeta,
  type RollbackScene,
  type Transition,
  type TransitionEnvironment,
} from './release-hub-transition.ts';

import { syncDirectory } from './release-photo-paths.ts';

const ROOT = join(import.meta.dirname, '..');

export const BACKUP_DATABASE_FILE = 'smarteverything.db';
export const SERVICE_ENTRY = HUB_SERVICE_ENTRY;
export const SERVICE_FILES = [
  SERVICE_ENTRY,
  'voice-worker.mjs',
  'loop-watchdog.mjs',
  'hook-helper.mjs',
  'raster-worker.mjs',
] as const;

const STORE_MODULE = join(ROOT, 'apps', 'hub', 'src', 'store', 'store.ts');
const FREE_SPACE_FACTOR = 3;
const BACKUP_STATUS_FILE = 'status';
export type BackupStatus = 'verified' | 'rolled-back';

export interface HubInstall {
  readonly directory: string;
  readonly service: string;
}

export interface ReleaseTarget {
  readonly install: HubInstall;
  readonly data: DataLayout;
}

export class ReleaseStepError extends Error {
  override readonly name = 'ReleaseStepError';

  constructor(
    readonly step: string,
    reason: string,
  ) {
    super(`${step}: ${reason}`);
  }
}

export function hubInstall(install?: string): HubInstall {
  const directory = install ?? defaultHubInstall();
  return { directory, service: join(directory, HUB_SERVICE_DIRECTORY) };
}

export function dataLayoutOf(root: string): DataLayout {
  return layoutFromNames(root, hasV1Marker(root) ? V1_NAMES : LEGACY_NAMES, env);
}

export interface ReleaseScene {
  readonly target: ReleaseTarget;
  readonly transition: Transition | null;
}

export function releaseSceneOf(install: string, root: string): ReleaseScene {
  const after = dataLayoutOf(root);
  if (hasV1Marker(root))
    return { target: { install: hubInstall(install), data: after }, transition: null };
  return {
    target: { install: hubInstall(install), data: legacyLayoutOf(root) },
    transition: { after, unit: hubUnitSpec(install) },
  };
}

export function builtServiceProblems(directory: string): readonly string[] {
  const desktop = desktopPayloadIn(directory);
  if (desktop !== undefined) return [`${directory} contains desktop content (${desktop}).`];
  return SERVICE_FILES.filter((file) => !existsSync(join(directory, file))).map(
    (file) => `${join(directory, file)} is missing; build it with tooling/build-service.ts first`,
  );
}

export function vacuumInto(source: string, target: string): void {
  const database = new DatabaseSync(source, { readOnly: true });
  try {
    database.prepare('vacuum into $path').run({ path: target });
  } finally {
    database.close();
  }
}

export function schemaVersionOf(database: string): number {
  const opened = new DatabaseSync(database, { readOnly: true });
  try {
    const row = z
      .object({ version: z.number().int().nullable() })
      .parse(opened.prepare('select max(version) as version from schema_version').get());
    return row.version ?? 0;
  } finally {
    opened.close();
  }
}

export function directorySize(path: string): number {
  const entries = readdirSync(path, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => !entry.isDirectory())
    .reduce((total, entry) => total + lstatSync(join(entry.parentPath, entry.name)).size, 0);
}

interface SpaceNeed {
  readonly path: string;
  readonly bytes: number;
}

function spaceProblems(needs: readonly SpaceNeed[]): readonly string[] {
  const byDevice = new Map<number, { path: string; bytes: number }>();
  for (const need of needs) {
    mkdirSync(need.path, { recursive: true });
    const device = statSync(need.path).dev;
    const known = byDevice.get(device);
    byDevice.set(device, {
      path: known?.path ?? need.path,
      bytes: (known?.bytes ?? 0) + need.bytes,
    });
  }
  return [...byDevice.values()].flatMap(({ path, bytes }) => {
    const stats = statfsSync(path);
    const free = stats.bavail * stats.bsize;
    return free >= bytes
      ? []
      : [
          `only ${String(Math.floor(free / 1e6))} MB are free in ${path}, a release needs ${String(Math.ceil(bytes / 1e6))} MB`,
        ];
  });
}

export function freeSpaceProblem(target: ReleaseTarget, built: string): string | null {
  const { install, data } = target;
  const problems = spaceProblems([
    {
      path: data.root,
      bytes:
        statSync(data.system.database.file).size * FREE_SPACE_FACTOR +
        directorySize(install.service),
    },
    { path: dirname(install.service), bytes: directorySize(built) },
  ]);
  return problems.length === 0 ? null : problems.join('; ');
}

function databaseProblem(database: string): string | null {
  if (!existsSync(database)) return `${database} is missing from the backup`;
  try {
    schemaVersionOf(database);
    return null;
  } catch (cause) {
    return `${database} cannot be read: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
}

export function rollbackProblems(
  target: ReleaseTarget,
  backup: string,
  withDatabase: boolean,
): readonly string[] {
  const service = join(backup, 'service');
  const database = join(backup, BACKUP_DATABASE_FILE);
  const problems = [
    ...SERVICE_FILES.filter((file) => !existsSync(join(service, file))).map(
      (file) => `${join(service, file)} is missing from the backup`,
    ),
    ...(withDatabase ? [databaseProblem(database)] : []).flatMap((one) =>
      one === null ? [] : [one],
    ),
  ];
  if (problems.length > 0) return problems;
  return spaceProblems([
    { path: dirname(target.install.service), bytes: directorySize(service) },
    { path: target.data.root, bytes: withDatabase ? statSync(database).size : 0 },
  ]);
}

export interface RollbackPreflight {
  readonly scene: RollbackScene;
  readonly problems: readonly string[];
}

export function rollbackPreflight(
  target: ReleaseTarget,
  backup: string,
  withDatabase: boolean,
  environment: TransitionEnvironment,
): RollbackPreflight {
  const scene = rollbackScene(target.data.root, backup, withDatabase, environment);
  const problems =
    scene.problems.length > 0
      ? scene.problems
      : rollbackProblems(target, scene.backup, withDatabase);
  return { scene, problems };
}

export function backUpRelease(target: ReleaseTarget, name: string, epoch: number): string {
  const { install, data } = target;
  const directory = join(data.backups.releases, `${name}-${String(epoch)}`);
  mkdirSync(directory, { recursive: true });
  cpSync(install.service, join(directory, 'service'), { recursive: true, verbatimSymlinks: true });
  vacuumInto(data.system.database.file, join(directory, BACKUP_DATABASE_FILE));
  writeBackupMeta(directory, data.root);
  return directory;
}

export function swapService(install: HubInstall, built: string, name: string): string {
  const aside = `${install.service}.old-${name}`;
  rmSync(aside, { recursive: true, force: true });
  renameSync(install.service, aside);
  try {
    cpSync(built, install.service, { recursive: true, verbatimSymlinks: true });
  } catch (cause) {
    rmSync(install.service, { recursive: true, force: true });
    renameSync(aside, install.service);
    throw new ReleaseStepError('swap', cause instanceof Error ? cause.message : String(cause));
  }
  return aside;
}

export function restoreService(install: HubInstall, backup: string, stamp: string): void {
  const aside = `${install.service}.rolled-back-${stamp}`;
  if (existsSync(aside)) rmSync(install.service, { recursive: true, force: true });
  else if (existsSync(install.service)) renameSync(install.service, aside);
  cpSync(join(backup, 'service'), install.service, { recursive: true, verbatimSymlinks: true });
}

export function restoreDatabase(data: DataLayout, backup: string, stamp: string): void {
  const { file, wal, shm } = data.system.database;
  for (const live of [file, wal, shm]) {
    if (!existsSync(live)) continue;
    const aside = `${live}.rolled-back-${stamp}`;
    if (existsSync(aside)) rmSync(live);
    else renameSync(live, aside);
  }
  cpSync(join(backup, BACKUP_DATABASE_FILE), file);
}

const OPEN_STORE = z.object({
  openStore: z.custom<(options: StoreOptions) => { readonly close: () => void }>(
    (value) => typeof value === 'function',
  ),
});

interface StoreOptions {
  readonly path: string;
  readonly log: Logger;
  readonly now: () => Date;
  readonly systemTimeZone: string;
}

export interface MigrationCheck {
  readonly from: number;
  readonly to: number;
}

export async function checkMigrations(data: DataLayout): Promise<MigrationCheck> {
  const { openStore } = OPEN_STORE.parse(await import(pathToFileURL(STORE_MODULE).href));
  mkdirSync(data.tmp, { recursive: true });
  const scratch = mkdtempSync(join(data.tmp, 'release-migration-'));
  const copy = join(scratch, BACKUP_DATABASE_FILE);
  try {
    vacuumInto(data.system.database.file, copy);
    const from = schemaVersionOf(copy);
    const [first = 0, second = 0] = [1, 2].map((pass) => {
      const store = openStore({
        path: copy,
        log: new Logger(`tool.release-migration-pass-${String(pass)}`),
        now: () => new Date(),
        systemTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      store.close();
      return schemaVersionOf(copy);
    });
    if (first !== second) {
      throw new ReleaseStepError(
        'migration check',
        `a second open moved the schema from ${String(first)} to ${String(second)}, so the migrations are not idempotent`,
      );
    }
    return { from, to: first };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function markBackup(backup: string, status: BackupStatus): void {
  writeFileSync(join(backup, BACKUP_STATUS_FILE), status, { flush: true });
  syncDirectory(backup);
}

function statusOf(backup: string): BackupStatus | null {
  const file = join(backup, BACKUP_STATUS_FILE);
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8');
  return text === 'verified' || text === 'rolled-back' ? text : null;
}

export function pruneBackups(data: DataLayout): readonly string[] {
  const folder = data.backups.releases;
  if (!existsSync(folder)) return [];
  const entries = readdirSync(folder)
    .flatMap((name) => {
      const epoch = /-(\d+)$/u.exec(name)?.[1];
      return epoch === undefined
        ? []
        : [
            {
              path: join(folder, name),
              epoch: Number(epoch),
              status: statusOf(join(folder, name)),
            },
          ];
    })
    .sort((left, right) => right.epoch - left.epoch);
  const doomed = entries.filter((entry) => entry.status !== null);
  for (const entry of doomed) rmSync(entry.path, { recursive: true, force: true });
  return doomed.map((entry) => entry.path);
}

export function pruneReleaseLeftovers(target: ReleaseTarget, keepStamp: string | null): void {
  const { install, data } = target;
  const keep = keepStamp === null ? null : `.rolled-back-${keepStamp}`;
  const databaseName = basename(data.system.database.file);
  const databaseFolder = dirname(data.system.database.file);
  const leftovers = [
    ...readdirSync(dirname(install.service))
      .filter((name) =>
        [`${basename(install.service)}.old-`, `${basename(install.service)}.rolled-back-`].some(
          (prefix) => name.startsWith(prefix),
        ),
      )
      .map((name) => join(dirname(install.service), name)),
    ...readdirSync(databaseFolder)
      .filter((name) => name.startsWith(databaseName) && name.includes('.rolled-back-'))
      .map((name) => join(databaseFolder, name)),
  ];
  for (const path of leftovers) {
    if (keep === null || !path.endsWith(keep)) rmSync(path, { recursive: true, force: true });
  }
}
