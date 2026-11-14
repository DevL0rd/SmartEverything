import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { env } from 'node:process';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { hostPaths, pnpmVersionOf, type BuildHostLayout } from './build-host.ts';
import { readBuildHostPin, type BuildHostPin, type PinArch } from './build-host-pin.ts';
import { dataRootOf } from './data-root.ts';
import { provisionAndroidSdk } from './provision-android-sdk.ts';
import {
  downloadVerified,
  extractDebBinary,
  extractTarball,
  ProvisionError,
  runChecked,
  type Fetcher,
} from './provision-download.ts';
import { dataLayoutOf } from './release-hub-files.ts';

const ROOT = join(import.meta.dirname, '..');
const GOOGLE_SERVICES = join('apps', 'app', 'google-services.json');

export interface ProvisionOptions {
  readonly layout: BuildHostLayout;
  readonly root: string;
  readonly arch: PinArch;
  readonly pin: BuildHostPin;
  readonly fetcher: Fetcher;
  readonly installPnpm: (version: string, prefix: string) => void;
  readonly acceptLicences: boolean;
}

export interface ProvisionResult {
  readonly installed: readonly string[];
  readonly problems: readonly string[];
}

function npmInstallPnpm(version: string, prefix: string): void {
  const npm = join(
    dirname(process.execPath),
    '..',
    'lib',
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  );
  runChecked(process.execPath, [
    npm,
    'install',
    '--prefix',
    prefix,
    '--no-audit',
    '--no-fund',
    '--ignore-scripts',
    `pnpm@${version}`,
  ]);
}

function provisionPnpm(options: ProvisionOptions): readonly string[] {
  const paths = hostPaths(options.layout, options.root);
  if (existsSync(paths.pnpm)) return [];
  const version = pnpmVersionOf(options.root);
  options.installPnpm(version, join(options.layout.cache.buildHost, 'pnpm', version));
  if (!existsSync(paths.pnpm)) throw new ProvisionError(`npm did not produce ${paths.pnpm}`);
  return [`pnpm ${version}`];
}

async function provisionDebTool(
  options: ProvisionOptions,
  name: 'zip' | 'unzip',
): Promise<string[]> {
  const { toolBin } = hostPaths(options.layout, options.root);
  const target = join(toolBin, name);
  if (existsSync(target)) return [];
  const download = options.pin.debian[name][options.arch];
  const deb = join(options.layout.cache.buildHost, 'downloads', basename(download.url));
  try {
    await downloadVerified(options.fetcher, download, deb);
    extractDebBinary(deb, `/usr/bin/${name}`, target);
  } finally {
    rmSync(deb, { force: true });
  }
  try {
    runChecked(target, ['-v']);
  } catch (cause) {
    rmSync(target, { force: true });
    throw cause;
  }
  return [name];
}

async function provisionJdk(options: ProvisionOptions): Promise<readonly string[]> {
  const { jdkHome } = hostPaths(options.layout, options.root);
  if (existsSync(join(jdkHome, 'bin', 'java'))) return [];
  const tarball = join(
    options.layout.cache.buildHost,
    'downloads',
    basename(options.pin.jdk[options.arch].url),
  );
  try {
    await downloadVerified(options.fetcher, options.pin.jdk[options.arch], tarball);
    rmSync(jdkHome, { recursive: true, force: true });
    extractTarball(tarball, jdkHome);
  } finally {
    rmSync(tarball, { force: true });
  }
  runChecked(join(jdkHome, 'bin', 'java'), ['-version']);
  return [`JDK ${String(options.pin.jdkMajor)}`];
}

async function provisionGo(options: ProvisionOptions): Promise<readonly string[]> {
  const { goHome } = hostPaths(options.layout, options.root);
  if (existsSync(join(goHome, 'bin', 'go'))) return [];
  const download = options.pin.go[options.arch];
  const tarball = join(options.layout.cache.buildHost, 'downloads', basename(download.url));
  try {
    await downloadVerified(options.fetcher, download, tarball);
    rmSync(goHome, { recursive: true, force: true });
    extractTarball(tarball, goHome);
  } finally {
    rmSync(tarball, { force: true });
  }
  runChecked(join(goHome, 'bin', 'go'), ['version']);
  return [`Go ${options.pin.go.version}`];
}

async function attempt(
  step: () => Promise<readonly string[]> | readonly string[],
  result: { installed: string[]; problems: string[] },
): Promise<void> {
  try {
    result.installed.push(...(await step()));
  } catch (cause) {
    if (!(cause instanceof ProvisionError)) throw cause;
    result.problems.push(cause.message);
  }
}

async function androidStep(options: ProvisionOptions): Promise<readonly string[]> {
  const paths = hostPaths(options.layout, options.root);
  const unzip = join(paths.toolBin, 'unzip');
  if (!existsSync(unzip) || !existsSync(join(paths.jdkHome, 'bin', 'java')))
    throw new ProvisionError('the Android SDK needs unzip and the JDK, which are not provisioned');
  return await provisionAndroidSdk({
    pin: options.pin,
    root: options.root,
    base: options.layout.cache.buildHost,
    sdk: paths.androidHome,
    jdkHome: paths.jdkHome,
    unzip,
    fetcher: options.fetcher,
    acceptLicences: options.acceptLicences,
  });
}

function cacheFolders(options: ProvisionOptions): readonly string[] {
  const paths = hostPaths(options.layout, options.root);
  for (const folder of [paths.gradleHome, paths.electronCache])
    mkdirSync(folder, { recursive: true });
  return [];
}

function googleServicesProblems(root: string): readonly string[] {
  return existsSync(join(root, GOOGLE_SERVICES))
    ? []
    : [
        `${GOOGLE_SERVICES} is missing: from the development machine run scp ${GOOGLE_SERVICES} <host>:<checkout>/${GOOGLE_SERVICES}`,
      ];
}

export async function provisionBuildHost(options: ProvisionOptions): Promise<ProvisionResult> {
  const result: { installed: string[]; problems: string[] } = { installed: [], problems: [] };
  mkdirSync(options.layout.cache.buildHost, { recursive: true });
  await attempt(() => provisionPnpm(options), result);
  await attempt(() => provisionDebTool(options, 'unzip'), result);
  await attempt(() => provisionDebTool(options, 'zip'), result);
  await attempt(() => provisionJdk(options), result);
  await attempt(() => provisionGo(options), result);
  await attempt(() => androidStep(options), result);
  await attempt(() => cacheFolders(options), result);
  result.problems.push(...googleServicesProblems(options.root));
  return result;
}

function archOf(): PinArch {
  if (process.arch === 'x64' || process.arch === 'arm64') return process.arch;
  throw new ProvisionError(`${process.arch} is not a supported build host`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { data: { type: 'string' }, 'accept-android-sdk-licenses': { type: 'boolean' } },
  });
  const options = z
    .strictObject({ data: z.string().min(1).optional(), accept: z.boolean() })
    .parse({ data: values.data, accept: values['accept-android-sdk-licenses'] ?? false });
  const result = await provisionBuildHost({
    layout: dataLayoutOf(await dataRootOf(options.data, env)),
    root: ROOT,
    arch: archOf(),
    pin: readBuildHostPin(),
    fetcher: (url) => fetch(url),
    installPnpm: npmInstallPnpm,
    acceptLicences: options.accept,
  });
  for (const item of result.installed) process.stdout.write(`installed ${item}\n`);
  for (const problem of result.problems) process.stderr.write(`missing: ${problem}\n`);
  if (result.problems.length > 0) process.exitCode = 1;
  else process.stdout.write('The build host is complete.\n');
}

if (import.meta.main) {
  try {
    await main();
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 1;
  }
}
