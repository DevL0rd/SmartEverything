import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { androidHome, apkProblems, readApk, type ApkVariant } from './release-apk.ts';
import { agreedVersion, readVersions } from './release-version.ts';

const log = new Logger('tool.release-android');

const ROOT = join(import.meta.dirname, '..');
const APP = join(ROOT, 'apps', 'app');
const ANDROID = join(APP, 'android');
const JAVA_HOME = '/usr/lib/jvm/java-21-openjdk';
const GRADLE_LOCK_SECONDS = 1800;
const ARCHITECTURE = 'arm64-v8a';

const SIGNING_PROPERTIES = [
  'SMARTEVERYTHING_RELEASE_STORE_FILE',
  'SMARTEVERYTHING_RELEASE_STORE_PASSWORD',
  'SMARTEVERYTHING_RELEASE_KEY_ALIAS',
  'SMARTEVERYTHING_RELEASE_KEY_PASSWORD',
] as const;

const OPTIONS = z.object({
  variant: z.enum(['release', 'development']),
  server: z.url({ protocol: /^https$/u }),
  out: z.string().min(1),
  bundle: z.boolean(),
  versionCode: z.coerce.number().int().min(3).max(2100000000).optional(),
});

const IDENTITY = z.object({ storeIdentity: z.string().min(1) });
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
}

export class ReleasePreflightError extends Error {
  override readonly name = 'ReleasePreflightError';

  constructor(readonly problems: readonly string[]) {
    super(
      `The Android build cannot start:\n${problems.map((problem) => `- ${problem}`).join('\n')}`,
    );
  }
}

export function gradleLock(): string {
  return `/tmp/claude-${String(process.getuid?.() ?? 0)}/gradle.lock`;
}

export function buildEnvironment(options: BuildOptions): Readonly<Record<string, string>> {
  return {
    JAVA_HOME,
    ANDROID_HOME: androidHome(),
    EXPO_PUBLIC_SERVER_URL: options.server,
    CI: '1',
    NODE_ENV: options.variant === 'release' ? 'production' : 'development',
    ...(options.variant === 'development' ? { APP_VARIANT: 'development' } : {}),
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
    args: [
      'expo',
      'prebuild',
      '--platform',
      'android',
      '--no-install',
      ...(options.variant === 'release' ? ['--clean'] : []),
    ],
    cwd: APP,
    environment: buildEnvironment(options),
  };
}

export function gradleCommand(options: BuildOptions): Command {
  return {
    title: `build ${gradleTask(options)} for ${ARCHITECTURE}`,
    program: 'flock',
    args: [
      '-w',
      String(GRADLE_LOCK_SECONDS),
      gradleLock(),
      './gradlew',
      gradleTask(options),
      '--offline',
      `-PreactNativeArchitectures=${ARCHITECTURE}`,
    ],
    cwd: ANDROID,
    environment: buildEnvironment(options),
  };
}

function definedGradleProperties(): ReadonlySet<string> {
  const file = join(homedir(), '.gradle', 'gradle.properties');
  if (!existsSync(file)) return new Set();
  return new Set(
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line) => /^\s*([A-Za-z0-9_.]+)\s*=\s*\S/u.exec(line)?.[1] ?? []),
  );
}

export function missingSigning(
  environment: NodeJS.ProcessEnv,
  properties: ReadonlySet<string>,
): readonly string[] {
  return SIGNING_PROPERTIES.filter(
    (name) => (environment[name] ?? '') === '' && !properties.has(name),
  );
}

function googleServicesProblems(storeIdentity: string): readonly string[] {
  const file = join(APP, 'google-services.json');
  if (!existsSync(file))
    return [`${file} is missing; download it from the Firebase console for both packages`];
  const packages = GOOGLE_SERVICES.parse(JSON.parse(readFileSync(file, 'utf8'))).client.map(
    (client) => client.client_info.android_client_info.package_name,
  );
  return [storeIdentity, `${storeIdentity}.dev`]
    .filter((name) => !packages.includes(name))
    .map((name) => `google-services.json has no client for ${name}`);
}

export function preflightProblems(options: BuildOptions, storeIdentity: string): readonly string[] {
  return [
    ...googleServicesProblems(storeIdentity),
    ...(options.variant === 'release'
      ? missingSigning(process.env, definedGradleProperties()).map(
          (name) =>
            `${name} is not set; put it in ~/.gradle/gradle.properties or the environment (the release keystore stays outside the repository)`,
        )
      : []),
  ];
}

function run(command: Command): void {
  process.stdout.write(`${command.title}\n`);
  const result = spawnSync(command.program, [...command.args], {
    cwd: command.cwd,
    stdio: 'inherit',
    env: { ...process.env, ...command.environment },
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

async function verified(file: string, variant: ApkVariant): Promise<void> {
  const identity = IDENTITY.parse(JSON.parse(readFileSync(join(APP, 'app-identity.json'), 'utf8')));
  const problems = await apkProblems(readApk(file), {
    variant,
    storeIdentity: identity.storeIdentity,
    versionName: agreedVersion(readVersions()),
    versionCodeAbove: 2,
  });
  if (problems.length > 0) {
    throw new Error(
      `The built APK failed its checks:\n${problems.map((one) => `- ${one.message}`).join('\n')}`,
    );
  }
}

function parsedOptions(): BuildOptions {
  const { values } = parseArgs({
    options: {
      variant: { type: 'string' },
      server: { type: 'string' },
      out: { type: 'string' },
      bundle: { type: 'boolean' },
      'version-code': { type: 'string' },
    },
  });
  return OPTIONS.parse({
    variant: values.variant ?? 'release',
    server: values.server ?? process.env['EXPO_PUBLIC_SERVER_URL'],
    out: values.out ?? join(ROOT, 'tmp', 'apk'),
    bundle: values.bundle === true,
    versionCode: values['version-code'],
  });
}

function collect(options: BuildOptions): string {
  const apk = builtApk(options);
  mkdirSync(options.out, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replaceAll(/[-:T]/gu, '');
  const target = join(
    options.out,
    `SmartEverything-${options.variant}-${agreedVersion(readVersions())}-${stamp}.apk`,
  );
  copyFileSync(apk, target);
  return target;
}

async function main(): Promise<void> {
  const options = parsedOptions();
  const identity = IDENTITY.parse(JSON.parse(readFileSync(join(APP, 'app-identity.json'), 'utf8')));
  const problems = preflightProblems(options, identity.storeIdentity);
  if (problems.length > 0) throw new ReleasePreflightError(problems);
  const building = log.operation('android.build', {
    variant: options.variant,
    task: gradleTask(options),
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
    await verified(builtApk(options), options.variant);
    const target = collect(options);
    building.succeeded({ apk: target });
    process.stdout.write(`${target}\n`);
  } catch (error) {
    building.failed(error);
    throw error;
  }
}

if (import.meta.main) await main();
