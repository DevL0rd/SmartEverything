import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { env } from 'node:process';
import type { BuildHostPin } from './build-host-pin.ts';
import {
  downloadVerified,
  ProvisionError,
  runChecked,
  type Fetcher,
} from './provision-download.ts';

export interface SdkVersions {
  readonly platform: string;
  readonly buildTools: string;
  readonly ndk: string;
}

export interface AndroidSdkInput {
  readonly pin: BuildHostPin;
  readonly root: string;
  readonly base: string;
  readonly sdk: string;
  readonly jdkHome: string;
  readonly unzip: string;
  readonly fetcher: Fetcher;
  readonly acceptLicences: boolean;
}

const VERSIONS_FILE = join('node_modules', 'react-native', 'gradle', 'libs.versions.toml');
const LICENCE_ACCEPTED = join('licenses', 'android-sdk-license');
const LICENCE_NAME = /^License (\S+):$/gmu;
const LICENCE_ANSWERS = 'y\n'.repeat(64);

function versionOf(text: string, key: string): string {
  const value = new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'mu').exec(text)?.[1];
  if (value === undefined)
    throw new ProvisionError(`${VERSIONS_FILE} has no ${key}; run pnpm install in the checkout`);
  return value;
}

export function readSdkVersions(root: string): SdkVersions {
  const file = join(root, VERSIONS_FILE);
  if (!existsSync(file))
    throw new ProvisionError(`${file} is missing; install the checkout dependencies first`);
  const text = readFileSync(file, 'utf8');
  return {
    platform: versionOf(text, 'compileSdk'),
    buildTools: versionOf(text, 'buildTools'),
    ndk: versionOf(text, 'ndkVersion'),
  };
}

function packagesOf(versions: SdkVersions, cmake: string): readonly (readonly [string, string])[] {
  return [
    [`platforms;android-${versions.platform}`, join('platforms', `android-${versions.platform}`)],
    [`build-tools;${versions.buildTools}`, join('build-tools', versions.buildTools)],
    [`ndk;${versions.ndk}`, join('ndk', versions.ndk)],
    [`cmake;${cmake}`, join('cmake', cmake)],
  ];
}

async function installCommandLineTools(input: AndroidSdkInput): Promise<void> {
  const archive = join(input.base, 'downloads', basename(input.pin.androidCommandLineTools.url));
  const staging = `${input.sdk}.staging`;
  rmSync(staging, { recursive: true, force: true });
  try {
    await downloadVerified(input.fetcher, input.pin.androidCommandLineTools, archive);
    mkdirSync(staging, { recursive: true });
    runChecked(input.unzip, ['-q', archive, '-d', staging]);
    mkdirSync(join(input.sdk, 'cmdline-tools'), { recursive: true });
    renameSync(join(staging, 'cmdline-tools'), join(input.sdk, 'cmdline-tools', 'latest'));
  } finally {
    rmSync(staging, { recursive: true, force: true });
    rmSync(archive, { force: true });
  }
}

function sdkEnvironment(input: AndroidSdkInput): NodeJS.ProcessEnv {
  return { ...env, JAVA_HOME: input.jdkHome, ANDROID_HOME: input.sdk };
}

function acceptLicences(manager: string, input: AndroidSdkInput): readonly string[] {
  const output = runChecked(manager, [`--sdk_root=${input.sdk}`, '--licenses'], {
    env: sdkEnvironment(input),
    input: LICENCE_ANSWERS,
  });
  if (!existsSync(join(input.sdk, LICENCE_ACCEPTED)))
    throw new ProvisionError('sdkmanager finished without recording the Android SDK licence');
  return [...output.matchAll(LICENCE_NAME)].map((match) => match[1] ?? '');
}

export async function provisionAndroidSdk(input: AndroidSdkInput): Promise<readonly string[]> {
  const manager = join(input.sdk, 'cmdline-tools', 'latest', 'bin', 'sdkmanager');
  const done: string[] = [];
  const missing = packagesOf(readSdkVersions(input.root), input.pin.cmake).filter(
    ([, folder]) => !existsSync(join(input.sdk, folder)),
  );
  if (!existsSync(manager)) {
    await installCommandLineTools(input);
    done.push('Android command line tools');
  }
  if (missing.length === 0) return done;
  if (!existsSync(join(input.sdk, LICENCE_ACCEPTED))) {
    if (!input.acceptLicences)
      throw new ProvisionError(
        'the Android SDK licences are not accepted: read them with sdkmanager --licenses, then run again with --accept-android-sdk-licenses',
      );
    done.push(`Android SDK licences accepted (${acceptLicences(manager, input).join(', ')})`);
  }
  runChecked(manager, [`--sdk_root=${input.sdk}`, ...missing.map(([name]) => name)], {
    env: sdkEnvironment(input),
  });
  return [...done, ...missing.map(([name]) => name)];
}
