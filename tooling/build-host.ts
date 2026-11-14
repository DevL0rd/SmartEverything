import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { env } from 'node:process';
import { z } from 'zod';
import { readBuildHostPin } from './build-host-pin.ts';
import type { HubLayout } from '../apps/hub/src/data-layout/index.ts';

export const BUILD_HOST_NEEDS = ['hub', 'ui', 'app', 'desktop'] as const;

export type BuildHostNeed = (typeof BUILD_HOST_NEEDS)[number];

export type BuildHostLayout = Pick<HubLayout, 'tmp' | 'cache'>;

export class BuildHostError extends Error {
  override readonly name = 'BuildHostError';

  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(
      `This machine cannot build the update:\n${problems.map((problem) => `- ${problem}`).join('\n')}`,
    );
    this.problems = problems;
  }
}

export interface BuildHost {
  readonly pnpm: string;
}

export interface HostPaths extends BuildHost {
  readonly toolBin: string;
  readonly jdkHome: string;
  readonly goHome: string;
  readonly androidHome: string;
  readonly gradleHome: string;
  readonly electronCache: string;
  readonly tmp: string;
}

const PACKAGE_MANAGER = z.looseObject({
  packageManager: z.string().regex(/^pnpm@\d+\.\d+\.\d+$/u),
});

let active: BuildHost | undefined;

export function pnpmVersionOf(root: string): string {
  const parsed = PACKAGE_MANAGER.parse(
    JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')),
  );
  return parsed.packageManager.slice('pnpm@'.length);
}

export function hostPaths(layout: BuildHostLayout, root: string): HostPaths {
  const base = layout.cache.buildHost;
  return {
    pnpm: join(base, 'pnpm', pnpmVersionOf(root), 'node_modules', '.bin', 'pnpm'),
    toolBin: join(base, 'bin'),
    jdkHome: join(base, `jdk-${String(readBuildHostPin().jdkMajor)}`),
    goHome: join(base, `go-${readBuildHostPin().go.version}`),
    androidHome: join(base, 'android-sdk'),
    gradleHome: join(base, 'gradle'),
    electronCache: join(base, 'electron'),
    tmp: layout.tmp,
  };
}

function executable(path: string): boolean {
  const stats = statSync(path, { throwIfNoEntry: false });
  return stats !== undefined && stats.isFile() && (stats.mode & 0o111) !== 0;
}

function onPath(name: string, extra: readonly string[] = []): string | undefined {
  const found = [...extra, ...(env['PATH'] ?? '').split(delimiter)]
    .filter((directory) => directory !== '')
    .map((directory) => join(directory, name))
    .find(executable);
  return found;
}

export function applyBuildHost(layout: BuildHostLayout, root: string): BuildHost {
  const paths = hostPaths(layout, root);
  mkdirSync(paths.tmp, { recursive: true });
  env['PATH'] = [
    dirname(process.execPath),
    dirname(paths.pnpm),
    join(paths.jdkHome, 'bin'),
    join(paths.goHome, 'bin'),
    paths.toolBin,
    ...(env['PATH'] ?? '').split(delimiter),
  ]
    .filter((directory) => directory !== '')
    .join(delimiter);
  env['JAVA_HOME'] = paths.jdkHome;
  env['ANDROID_HOME'] = paths.androidHome;
  env['GRADLE_USER_HOME'] = paths.gradleHome;
  env['electron_config_cache'] = paths.electronCache;
  env['TMPDIR'] = paths.tmp;
  active = { pnpm: paths.pnpm };
  return active;
}

export function applyDeveloperHost(): BuildHost {
  const pnpm = onPath('pnpm');
  if (pnpm === undefined) throw new BuildHostError(['pnpm is not on the PATH']);
  active = { pnpm };
  return active;
}

export function pnpmProgram(): string {
  if (active === undefined)
    throw new BuildHostError(['the build host was not applied before a build step was prepared']);
  return active.pnpm;
}

export function nodeToolCommand(script: string): {
  readonly program: string;
  readonly args: readonly string[];
} {
  return { program: process.execPath, args: ['--import', 'tsx', script] };
}

function systemProblems(paths: HostPaths, need: BuildHostNeed): readonly string[] {
  const tools = need === 'hub' ? [] : need === 'desktop' ? ['zip', 'unzip'] : ['unzip'];
  return tools
    .filter((tool) => onPath(tool, [paths.toolBin]) === undefined)
    .map(
      (tool) =>
        `${tool} is not provisioned in ${paths.toolBin}: run tooling/provision-build-host.ts`,
    );
}

function goProblems(paths: HostPaths): readonly string[] {
  return existsSync(join(paths.goHome, 'bin', 'go'))
    ? []
    : [`Go is not provisioned at ${paths.goHome}: run tooling/provision-build-host.ts`];
}

function androidProblems(paths: HostPaths, root: string): readonly string[] {
  const missing = (path: string): boolean => !existsSync(path);
  const sdk = paths.androidHome;
  return [
    ...(missing(join(paths.jdkHome, 'bin', 'java'))
      ? [`the JDK is not provisioned at ${paths.jdkHome}: run tooling/provision-build-host.ts`]
      : []),
    ...['build-tools', 'platforms', 'ndk', join('cmake', readBuildHostPin().cmake)]
      .filter((part) => missing(join(sdk, part)))
      .map(
        (part) =>
          `the Android SDK part ${part} is not provisioned in ${sdk}: run tooling/provision-build-host.ts`,
      ),
    ...(missing(join(root, 'apps', 'app', 'google-services.json'))
      ? [
          `apps/app/google-services.json is missing: copy it from the development machine to ${join(root, 'apps', 'app', 'google-services.json')}`,
        ]
      : []),
  ];
}

export function requireBuildHost(layout: BuildHostLayout, root: string, need: BuildHostNeed): void {
  const paths = hostPaths(layout, root);
  const problems = [
    ...(existsSync(paths.pnpm)
      ? []
      : [
          `pnpm ${pnpmVersionOf(root)} is not provisioned at ${paths.pnpm}: run tooling/provision-build-host.ts`,
        ]),
    ...systemProblems(paths, need),
    ...(need === 'desktop' ? goProblems(paths) : []),
    ...(need === 'app' ? androidProblems(paths, root) : []),
  ];
  if (problems.length > 0) throw new BuildHostError(problems);
}
