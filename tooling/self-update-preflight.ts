import { existsSync, readFileSync, statfsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { androidHome, javaHome } from './release-process.ts';

export const MINIMUM_NODE_MAJOR = 26;

export const MINIMUM_GRADLE = 8;

const FREE_SPACE_FACTOR = 3;

const TYPE_ERROR_LINE = /^apps\/hub\/src\/.* error TS\d+:/u;

export interface PreflightInput {
  readonly root: string;
  readonly data: string;
  readonly node: string;
  readonly nodeVersion: string;
  readonly stepFile: string;
  readonly service: string;
  readonly database: string;
  readonly serviceFiles: readonly string[];
}

function majorOf(text: string): number {
  const [major = '0'] = text.replace(/^v/u, '').split('.');
  return Number(major);
}

function nodeProblems(version: string): readonly string[] {
  const major = majorOf(version);
  return Number.isInteger(major) && major >= MINIMUM_NODE_MAJOR
    ? []
    : [`Node ${version} is older than ${String(MINIMUM_NODE_MAJOR)}`];
}

function gradleProblems(root: string): readonly string[] {
  const properties = join(
    root,
    'apps',
    'app',
    'android',
    'gradle',
    'wrapper',
    'gradle-wrapper.properties',
  );
  if (!existsSync(properties)) return [`${properties} is missing; prebuild the app project first`];
  const declared = /gradle-(\d+)\.(\d+(?:\.\d+)?)/u.exec(readFileSync(properties, 'utf8'));
  const major = declared === null ? 0 : Number(declared[1]);
  if (declared === null || major < MINIMUM_GRADLE) {
    return [
      `Gradle ${declared?.[0] ?? 'is unknown'}, and it must be ${String(MINIMUM_GRADLE)} or newer`,
    ];
  }
  const distribution = join(homedir(), '.gradle', 'wrapper', 'dists', declared[0]);
  return existsSync(distribution)
    ? []
    : [`the Gradle distribution in ${distribution} is missing; build the app once online`];
}

function toolchainProblems(root: string): readonly string[] {
  const java = javaHome();
  const sdk = androidHome();
  return [
    ...(existsSync(join(java, 'bin', 'java')) ? [] : [`no Java at ${java}`]),
    ...(existsSync(join(sdk, 'build-tools')) ? [] : [`no Android build-tools in ${sdk}`]),
    ...(existsSync(join(root, 'node_modules', 'esbuild'))
      ? []
      : [`esbuild is not installed in ${join(root, 'node_modules')}`]),
    ...(existsSync(join(root, 'tmp', 'lockrun.sh')) ? [] : ['tmp/lockrun.sh is missing']),
    ...(existsSync(join(homedir(), '.gradle', 'caches')) ? [] : ['the Gradle cache is empty']),
  ];
}

function spaceProblems(data: string): readonly string[] {
  const stats = statfsSync(existsSync(data) ? data : homedir());
  const free = stats.bavail * stats.bsize;
  const needed = 1024 * 1024 * 1024 * FREE_SPACE_FACTOR;
  return free >= needed
    ? []
    : [`only ${String(Math.floor(free / 1e6))} MB are free where the hub keeps its backups`];
}

function serviceProblems(service: string, files: readonly string[]): readonly string[] {
  return files
    .filter((file) => !existsSync(join(service, file)))
    .map((file) => `${join(service, file)} is missing; build the service first`);
}

export function countHubTypeErrors(output: string): number {
  return output.split('\n').filter((line) => TYPE_ERROR_LINE.test(line)).length;
}

export function preflightProblems(input: PreflightInput): readonly string[] {
  return [
    ...nodeProblems(input.nodeVersion),
    ...gradleProblems(input.root),
    ...toolchainProblems(input.root),
    ...spaceProblems(input.data),
    ...serviceProblems(input.service, input.serviceFiles),
    ...(existsSync(input.database) ? [] : [`${input.database} is missing`]),
  ];
}
