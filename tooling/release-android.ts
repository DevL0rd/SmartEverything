import { spawnSync } from 'node:child_process';
import { ANDROID_APK_ABIS } from '@smarteverything/domain';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import {
  apkProblems,
  readApk,
  readAppIdentity,
  runtimeVersionOf,
  type ApkVariant,
} from './release-apk.ts';
import {
  androidHome,
  javaHome,
  releaseCommandEnvironment,
  releaseServer,
} from './release-process.ts';
import { readReleaseVersion } from './release-version.ts';

const log = new Logger('tool.release-android');

const ROOT = join(import.meta.dirname, '..');
const APP = join(ROOT, 'apps', 'app');
const ANDROID = join(APP, 'android');

const OPTIONS = z.object({
  variant: z.enum(['release', 'development']),
  server: z.url({ protocol: /^https$/u }),
  out: z.string().min(1),
  abi: z.enum([...ANDROID_APK_ABIS, 'universal']),
  bundle: z.boolean(),
  online: z.boolean().optional(),
  versionCode: z.coerce.number().int().min(3).max(2100000000).optional(),
  above: z.coerce.number().int().min(0),
});

const GOOGLE_SERVICES = z.object({
  client: z.array(
    z.object({
      client_info: z.object({ android_client_info: z.object({ package_name: z.string() }) }),
    }),
  ),
});

export type BuildOptions = z.infer<typeof OPTIONS>;

export interface Command {
  readonly title: string;
  readonly program: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly captureOutput?: boolean;
}

export class ReleasePreflightError extends Error {
  override readonly name = 'ReleasePreflightError';

  constructor(readonly problems: readonly string[]) {
    super(
      `The Android build cannot start:\n${problems.map((problem) => `- ${problem}`).join('\n')}`,
    );
  }
}

export type EnvironmentOptions = Pick<BuildOptions, 'variant' | 'server' | 'versionCode'>;

export function buildEnvironment(options: EnvironmentOptions): Readonly<Record<string, string>> {
  return {
    JAVA_HOME: javaHome(),
    ANDROID_HOME: androidHome(),
    EXPO_PUBLIC_SERVER_URL: options.server,
    CI: '1',
    NODE_ENV: options.variant === 'release' ? 'production' : 'development',
    ANDROID_VARIANT: options.variant,
    ...(options.versionCode === undefined
      ? {}
      : { ANDROID_VERSION_CODE: String(options.versionCode) }),
  };
}

export function gradleTask(options: BuildOptions): string {
  if (options.variant === 'development') return 'assembleDebug';
  return options.bundle ? 'bundleRelease' : 'assembleRelease';
}

export function licenceCommand(): Command {
  return {
    title: 'write the licence list and notices',
    program: 'npx',
    args: ['tsx', join(ROOT, 'tooling', 'generate-licenses.ts')],
    cwd: ROOT,
    environment: {},
  };
}

export function prebuildCommand(options: BuildOptions): Command {
  return {
    title: `generate the ${options.variant} Android project`,
    program: 'npx',
    args: ['expo', 'prebuild', '--platform', 'android', '--no-install', '--clean'],
    cwd: APP,
    environment: buildEnvironment(options),
  };
}

export function gradleCommand(options: BuildOptions): Command {
  return {
    title: `build ${gradleTask(options)} for ${options.abi}`,
    program: join(ROOT, 'tmp', 'lockrun.sh'),
    args: [
      'gradle',
      '1',
      './gradlew',
      gradleTask(options),
      ...(options.online === true ? [] : ['--offline']),
      `-PreactNativeArchitectures=${options.abi === 'universal' ? ANDROID_APK_ABIS.join(',') : options.abi}`,
    ],
    cwd: ANDROID,
    environment: buildEnvironment(options),
  };
}

export function preflightProblems(applicationId: string): readonly string[] {
  const file = join(APP, 'google-services.json');
  if (!existsSync(file))
    return [`${file} is missing; download it from the Firebase console for ${applicationId}`];
  const packages = GOOGLE_SERVICES.parse(JSON.parse(readFileSync(file, 'utf8'))).client.map(
    (client) => client.client_info.android_client_info.package_name,
  );
  return packages.includes(applicationId)
    ? []
    : [`google-services.json has no client for ${applicationId}`];
}

function run(command: Command): void {
  process.stdout.write(`${command.title}\n`);
  const result = spawnSync(command.program, [...command.args], {
    cwd: command.cwd,
    stdio: 'inherit',
    env: releaseCommandEnvironment(command.environment),
  });
  if (result.status !== 0) {
    throw new Error(`${command.title} failed with exit code ${String(result.status)}`);
  }
}

function builtApk(options: BuildOptions): string {
  const kind = options.variant === 'release' ? 'release' : 'debug';
  const file = join(ANDROID, 'app', 'build', 'outputs', 'apk', kind, `app-${kind}.apk`);
  if (!existsSync(file)) throw new Error(`Gradle finished but ${file} does not exist`);
  return file;
}

interface Verification {
  readonly file: string;
  readonly variant: ApkVariant;
  readonly server: string;
  readonly versionName: string;
  readonly above: number;
}

async function verified({
  file,
  variant,
  server,
  versionName,
  above,
}: Verification): Promise<string | null> {
  const identity = readAppIdentity();
  const facts = readApk(file);
  const problems = await apkProblems(facts, {
    variant,
    server,
    applicationId: identity.applicationId,
    signingCertificateSha256: identity.signingCertificateSha256,
    versionName,
    versionCodeAbove: above,
  });
  if (problems.length > 0) {
    throw new Error(
      `The built APK failed its checks:\n${problems.map((one) => `- ${one.message}`).join('\n')}`,
    );
  }
  return variant === 'release' ? runtimeVersionOf(facts) : null;
}

function parsedOptions(): BuildOptions {
  const { values } = parseArgs({
    options: {
      variant: { type: 'string' },
      server: { type: 'string' },
      out: { type: 'string' },
      abi: { type: 'string' },
      bundle: { type: 'boolean' },
      online: { type: 'boolean' },
      'version-code': { type: 'string' },
      above: { type: 'string' },
    },
  });
  if (values.above === undefined) {
    throw new Error(
      '--above <versionCode of the newest published or installed build> is required; the build must be newer than it',
    );
  }
  return OPTIONS.parse({
    variant: values.variant ?? 'release',
    server: values.server ?? releaseServer(),
    out: values.out ?? join(ROOT, 'tmp', 'apk'),
    abi: values.abi ?? 'arm64-v8a',
    bundle: values.bundle === true,
    online: values.online === true,
    versionCode: values['version-code'],
    above: values.above,
  });
}

function collect(options: BuildOptions, apk: string, versionName: string): string {
  mkdirSync(options.out, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replaceAll(/[-:T]/gu, '');
  const target = join(
    options.out,
    `SmartEverything-${options.variant}-${options.abi}-${versionName}-${stamp}.apk`,
  );
  copyFileSync(apk, target);
  return target;
}

async function main(): Promise<void> {
  const options = parsedOptions();
  const problems = preflightProblems(readAppIdentity().applicationId);
  if (problems.length > 0) throw new ReleasePreflightError(problems);
  const building = log.operation('android.build', {
    variant: options.variant,
    task: gradleTask(options),
    abi: options.abi,
  });
  try {
    run(licenceCommand());
    run(prebuildCommand(options));
    writeFileSync(join(ANDROID, 'local.properties'), `sdk.dir=${androidHome()}\n`);
    run(gradleCommand(options));
    if (options.bundle) {
      building.succeeded({ bundle: true });
      return;
    }
    const apk = builtApk(options);
    const versionName = readReleaseVersion('app');
    const runtime = await verified({
      file: apk,
      variant: options.variant,
      server: options.server,
      versionName,
      above: options.above,
    });
    const target = collect(options, apk, versionName);
    if (runtime !== null) process.stdout.write(`runtime version ${runtime}\n`);
    building.succeeded({ apk: target, runtime });
    process.stdout.write(`${target}\n`);
  } catch (error) {
    building.failed(error);
    throw error;
  }
}

if (import.meta.main) await main();
