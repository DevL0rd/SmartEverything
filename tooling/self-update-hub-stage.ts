import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  RELEASE_FILES_DIRECTORY,
  type ReleaseKeyRole,
  type ReleaseManifest,
} from '@smarteverything/domain';
import type { HubLayout } from '../apps/hub/src/data-layout/index.ts';
import { trustedReleaseKeys } from '../apps/hub/src/releases/trust.ts';
import { verifyRelease } from '../apps/hub/src/releases/verify.ts';
import { UPDATE_ENTRY_DIRECTORY, UPDATE_ENTRY_FILES } from './hub-install-layout.ts';
import {
  ReleaseStepError,
  serviceMigrationCheck,
  type MigrationCheck,
} from './release-hub-files.ts';
import type { HubBuild } from './self-update-hub-build.ts';
import {
  SERVICE_TARGET_NAME,
  verifyServiceTarget,
  type ServiceTargetName,
} from './service-target.ts';

type HubManifest = Extract<ReleaseManifest, { artifact: 'hub' }>;

export interface HubStage {
  readonly release: string;
  readonly keysFile: string;
  readonly role: ReleaseKeyRole;
  readonly node: string;
  readonly host: ServiceTargetName;
  readonly verifyTarget?: (directory: string, target: ServiceTargetName) => void;
}

const STAGED_COPY_SUFFIX = '.release';
const NODE_VERSION = /^v(\d+)\.\d+\.\d+$/u;

export function hostServiceTarget(): ServiceTargetName {
  const host = `${process.platform}-${process.arch}`;
  const target = SERVICE_TARGET_NAME.safeParse(host);
  if (!target.success)
    throw new ReleaseStepError(
      'release fit',
      `this Hub runs on ${host}, which no hub release targets`,
    );
  return target.data;
}

async function verifiedManifest(root: string, stage: HubStage): Promise<HubManifest> {
  const { manifest } = await verifyRelease(root, {
    keys: await trustedReleaseKeys(stage.keysFile),
    role: stage.role,
    artifact: 'hub',
  });
  if (manifest.artifact !== 'hub')
    throw new ReleaseStepError(
      'verify release',
      `expected a hub release, got ${manifest.artifact}`,
    );
  return manifest;
}

function nodeMajorOf(node: string): string {
  const result = spawnSync(node, ['--version'], { encoding: 'utf8' });
  const major = NODE_VERSION.exec(result.stdout.trim())?.[1];
  if (result.status !== 0 || major === undefined)
    throw new ReleaseStepError('release fit', `${node} did not report its Node.js version`);
  return major;
}

function requireFit(manifest: HubManifest, stage: HubStage): void {
  const problems: string[] = [];
  if (manifest.target !== stage.host)
    problems.push(
      `the release is built for ${manifest.target}, but this Hub runs on ${stage.host}`,
    );
  const needed = manifest.facts.nodeVersion.split('.')[0] ?? '';
  const installed = nodeMajorOf(stage.node);
  if (needed !== installed)
    problems.push(
      `the release needs Node.js ${needed}, but the installed bundled Node.js is ${installed}`,
    );
  if (problems.length > 0) throw new ReleaseStepError('release fit', problems.join('; '));
}

function requireUpdateEntries(directory: string): void {
  const missing = Object.values(UPDATE_ENTRY_FILES)
    .map((file) => join(UPDATE_ENTRY_DIRECTORY, file))
    .filter((file) => !existsSync(join(directory, file)));
  if (missing.length > 0)
    throw new ReleaseStepError('verify release', `the service misses ${missing.join(', ')}`);
}

function verifyBinaries(directory: string, target: ServiceTargetName): void {
  verifyServiceTarget(directory, target, { binaries: true });
}

async function copyVerified(stage: HubStage, reviewed: HubManifest, output: string): Promise<void> {
  const copy = `${output}${STAGED_COPY_SUFFIX}`;
  if (existsSync(copy)) throw new Error(`${copy} already exists.`);
  try {
    cpSync(stage.release, copy, {
      recursive: true,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true,
    });
    const copied = await verifiedManifest(copy, stage);
    if (JSON.stringify(copied) !== JSON.stringify(reviewed))
      throw new ReleaseStepError(
        'verify release',
        'the staged release changed after it was reviewed',
      );
    renameSync(join(copy, RELEASE_FILES_DIRECTORY), output);
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

function stagedMigrations(
  stage: HubStage,
  manifest: HubManifest,
  service: string,
  layout: HubLayout,
): MigrationCheck {
  const check = serviceMigrationCheck(stage.node, service, layout);
  const { schemaMin, schemaMax } = manifest.facts;
  if (check.from < schemaMin || check.to !== schemaMax)
    throw new ReleaseStepError(
      'migration check',
      `the release declares schemas ${String(schemaMin)} to ${String(schemaMax)}, but it moved the database from ${String(check.from)} to ${String(check.to)}`,
    );
  return check;
}

export function stagedHubBuild(stage: HubStage): HubBuild {
  let reviewed: HubManifest | undefined;
  let service: string | undefined;
  function reviewedManifest(): HubManifest {
    if (reviewed === undefined) throw new Error('Check the staged release before building it.');
    return reviewed;
  }
  return {
    typeErrors: async (): Promise<number> => {
      const manifest = await verifiedManifest(stage.release, stage);
      requireFit(manifest, stage);
      reviewed = manifest;
      return 0;
    },
    build: async (output): Promise<void> => {
      const manifest = reviewedManifest();
      await copyVerified(stage, manifest, output);
      try {
        requireUpdateEntries(output);
        (stage.verifyTarget ?? verifyBinaries)(output, manifest.target);
      } catch (cause) {
        rmSync(output, { recursive: true, force: true });
        throw cause;
      }
      service = output;
    },
    checkMigrations: (layout): Promise<MigrationCheck> =>
      new Promise((resolve) => {
        if (service === undefined) throw new Error('Build the staged release before checking it.');
        resolve(stagedMigrations(stage, reviewedManifest(), service, layout));
      }),
  };
}
