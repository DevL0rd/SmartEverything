import { APP_IDENTITY } from '@smarteverything/domain/app-identity';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  MACHINE_UPDATE_ARCHES,
  type AppUpdatePlatform,
  type ReleaseArtifact,
} from '@smarteverything/domain';
import { desktopWebRuntime } from '../apps/desktop/packaging/web-runtime.ts';
import { MIGRATIONS } from '../apps/hub/src/store/migrations/index.ts';
import { pnpmProgram } from './build-host.ts';
import {
  androidSources,
  configCommand,
  exportCommand,
  parseExpoClient,
  parseRuntime,
  runtimeCommand,
} from './publish-app-update-android.ts';
import { exportedPaths, webExportCommand, WEB_EXPORT } from './publish-app-update-desktop.ts';
import { PublishOutputError, runCommand } from './publish-app-update-shared.ts';
import { apkProblems, readApk, type ApkFacts } from './release-apk.ts';
import { licenceCommand } from './release-android.ts';
import { artifactOf } from './release-machine-update.ts';
import { builtServiceProblems } from './release-hub-files.ts';
import { readReleaseVersion } from './release-version.ts';
import {
  driveMountCommand,
  makeCommand,
  shellCommand,
  zipDirectory,
} from './self-update-desktop-command.ts';
import {
  SERVICE_TARGET_NAME,
  verifyServiceTarget,
  type ServiceTargetName,
} from './service-target.ts';

export const EXPO_CLIENT_FILE = 'expo-client.json';
export const WEB_RUNTIME_FILE = 'runtime-version.txt';
export const APK_FILE = 'app.apk';
export const DESKTOP_BUILD_ARCHES = MACHINE_UPDATE_ARCHES;

export class ReleaseBuildError extends Error {
  override readonly name = 'ReleaseBuildError';
}

export interface Built {
  readonly artifact: ReleaseArtifact;
  readonly target: string;
  readonly version: string;
  readonly facts: unknown;
}

export interface BuildRequest {
  readonly root: string;
  readonly files: string;
  readonly scratch: string;
}

export function hostTarget(): ServiceTargetName {
  return SERVICE_TARGET_NAME.parse(`linux-${process.arch === 'arm64' ? 'arm64' : 'x64'}`);
}

export function schemaRange(): { readonly schemaMin: number; readonly schemaMax: number } {
  const versions = MIGRATIONS.map((migration) => migration.version);
  return {
    schemaMin: Math.max(0, Math.min(...versions) - 1),
    schemaMax: Math.max(...versions),
  };
}

export function buildHub(request: BuildRequest, target: ServiceTargetName): Built {
  if (!existsSync(join(request.root, 'tooling', 'go2rtc', 'out')))
    runCommand({
      title: 'build go2rtc',
      program: pnpmProgram(),
      args: ['run', 'build:go2rtc'],
      cwd: request.root,
      environment: {},
    });
  runCommand({
    title: `build the Hub service for ${target}`,
    program: process.execPath,
    args: [
      '--import',
      'tsx',
      join(request.root, 'tooling', 'build-headless-hub.ts'),
      '--target',
      target,
      '--out',
      request.files,
    ],
    cwd: request.root,
    environment: {},
  });
  const problems = builtServiceProblems(request.files);
  if (problems.length > 0)
    throw new ReleaseBuildError(`The built service is incomplete:\n${problems.join('\n')}`);
  verifyServiceTarget(request.files, target, { binaries: true });
  return {
    artifact: 'hub',
    target,
    version: readReleaseVersion('hub', request.root),
    facts: { ...schemaRange(), nodeVersion: process.versions.node },
  };
}

async function checkedApk(
  apk: string,
  server: string,
  above: number,
  root: string,
): Promise<ApkFacts & { readonly signerSha256: string }> {
  const facts = readApk(apk);
  const identity = APP_IDENTITY;
  const problems = await apkProblems(facts, {
    variant: 'release',
    server,
    applicationId: identity.applicationId,
    signingCertificateSha256: identity.signingCertificateSha256,
    versionName: readReleaseVersion('app', root),
    versionCodeAbove: above,
  });
  if (problems.length > 0 || facts.signerSha256 === null)
    throw new ReleaseBuildError(
      `The built APK failed its checks:\n${problems.map((one) => `- ${one.message}`).join('\n')}`,
    );
  return { ...facts, signerSha256: facts.signerSha256 };
}

export async function buildApk(
  request: BuildRequest,
  server: string,
  above: number,
): Promise<Built> {
  const out = join(request.scratch, 'apk');
  runCommand({
    title: 'build the signed Android release',
    program: process.execPath,
    args: [
      '--import',
      'tsx',
      join(request.root, 'tooling', 'release-android.ts'),
      '--server',
      server,
      '--out',
      out,
      '--abi',
      'universal',
      '--online',
      '--above',
      String(above),
    ],
    cwd: request.root,
    environment: {},
  });
  const built = (await readdir(out)).filter((file) => file.endsWith('.apk'));
  const [name] = built;
  if (name === undefined || built.length !== 1)
    throw new ReleaseBuildError('The Android build did not produce exactly one installer');
  const apk = join(request.files, APK_FILE);
  copyFileSync(join(out, name), apk);
  const facts = await checkedApk(apk, server, above, request.root);
  return {
    artifact: 'apk',
    target: 'android',
    version: readReleaseVersion('app', request.root),
    facts: {
      applicationId: facts.packageName,
      versionCode: String(facts.versionCode),
      signerSha256: facts.signerSha256,
    },
  };
}

async function androidUi(request: BuildRequest, server: string): Promise<string> {
  runCommand(licenceCommand());
  runCommand(exportCommand(server, request.files));
  const runtimeVersion = parseRuntime(runCommand(runtimeCommand(server)));
  const expoClient = parseExpoClient(runCommand(configCommand(server)));
  await androidSources(request.files);
  writeFileSync(join(request.files, EXPO_CLIENT_FILE), `${JSON.stringify(expoClient)}\n`);
  return runtimeVersion;
}

async function desktopUi(request: BuildRequest, server: string): Promise<string> {
  runCommand(webExportCommand(server));
  const paths = await exportedPaths(WEB_EXPORT);
  if (!paths.includes('index.html') || (await stat(join(WEB_EXPORT, 'index.html'))).size === 0)
    throw new PublishOutputError('desktop web export', 'expected a nonempty index.html');
  if (paths.includes('bundle.json'))
    throw new PublishOutputError(
      'desktop web export',
      'bundle.json is reserved by the desktop updater',
    );
  cpSync(WEB_EXPORT, request.files, { recursive: true });
  return desktopWebRuntime(join(request.root, 'apps', 'desktop'));
}

export async function buildUi(
  request: BuildRequest,
  platform: AppUpdatePlatform,
  server: string,
): Promise<Built> {
  const runtimeVersion =
    platform === 'android' ? await androidUi(request, server) : await desktopUi(request, server);
  return {
    artifact: 'ui',
    target: platform,
    version: readReleaseVersion('app', request.root),
    facts: { runtimeVersion },
  };
}

export async function buildDesktop(
  request: BuildRequest,
  arches: readonly (typeof DESKTOP_BUILD_ARCHES)[number][],
  server: string,
): Promise<Built> {
  const [first] = arches;
  if (first === undefined)
    throw new ReleaseBuildError('A desktop release needs at least one architecture');
  const version = readReleaseVersion('desktop', request.root);
  runCommand(webExportCommand(server));
  runCommand(shellCommand(request.root));
  runCommand(driveMountCommand(request.root));
  const runtime = await desktopWebRuntime(join(request.root, 'apps', 'desktop'));
  for (const arch of arches) {
    const directory = zipDirectory(request.root, arch);
    rmSync(directory, { recursive: true, force: true });
    runCommand(makeCommand(request.root, arch));
    const zips = (await readdir(directory)).filter((file) => file.endsWith('.zip'));
    const [name] = zips;
    if (name === undefined || zips.length !== 1)
      throw new PublishOutputError(`the linux ${arch} package`, 'expected exactly one ZIP');
    const zip = join(directory, name);
    await artifactOf({ platform: 'linux', arch, kind: 'zip', path: zip }, version);
    mkdirSync(join(request.files, arch), { recursive: true });
    renameSync(zip, join(request.files, arch, name));
  }
  writeFileSync(join(request.files, WEB_RUNTIME_FILE), `${runtime}\n`);
  return {
    artifact: 'desktop',
    target: `linux-${first}`,
    version,
    facts: { version, arches: [...arches] },
  };
}
