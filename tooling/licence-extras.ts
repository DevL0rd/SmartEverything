import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { ProductionPackage } from './licence-policy.ts';
import { REPOSITORY_ROOT } from './licence-policy.ts';

const APACHE = 'Apache-2.0';
const ANDROID_SDK = 'Android Software Development Kit License';

const ANDROID_LIBRARIES: Readonly<Record<string, string>> = {
  'androidx.health.connect:connect-client': APACHE,
  'androidx.work:work-runtime-ktx': APACHE,
  'androidx.lifecycle:lifecycle-process': APACHE,
  'org.jetbrains.kotlinx:kotlinx-coroutines-android': APACHE,
  'org.jetbrains.kotlinx:kotlinx-serialization-json': APACHE,
  'com.squareup.okhttp3:okhttp': APACHE,
  'io.netty:netty-codec-http': APACHE,
  'io.netty:netty-handler': APACHE,
  'io.netty:netty-transport': APACHE,
  'com.github.k2-fsa.sherpa-onnx:sherpa-onnx': APACHE,
  'com.google.android.gms:play-services-location': ANDROID_SDK,
  'com.google.firebase:firebase-messaging': APACHE,
  'host.exp.exponent:expo.modules.notifications': 'MIT',
};

const ANDROID_GRADLE = join(
  REPOSITORY_ROOT,
  'apps',
  'app',
  'modules',
  'health-connect',
  'android',
  'build.gradle',
);

const WEBRTC_BINARY = 'org.jitsi:webrtc';

const ELECTRON_MANIFEST = z.object({ version: z.string().min(1) });

const DEPENDENCY_LINE = /^\s*(?:implementation|compileOnly)\s+"([^":]+):([^":]+):([^":]+)"/gmu;

const WEBRTC_VERSION = /api\s+'org\.jitsi:webrtc:([^']+)'/u;

export class AndroidLibraryUnlistedError extends Error {
  override readonly name = 'AndroidLibraryUnlistedError';

  constructor(readonly coordinates: readonly string[]) {
    super(
      `Add the licence of ${coordinates.join(', ')} to ANDROID_LIBRARIES in tooling/licence-extras.ts: the Android module depends on them but the licence list does not name them.`,
    );
  }
}

export function androidDependencies(gradle: string): readonly ProductionPackage[] {
  return [...gradle.matchAll(DEPENDENCY_LINE)].flatMap((match) => {
    const [, group, artifact, version] = match;
    return group === undefined || artifact === undefined || version === undefined
      ? []
      : [{ name: `${group}:${artifact}`, version, licence: '' }];
  });
}

export function androidLibraries(gradle: string): readonly ProductionPackage[] {
  const declared = androidDependencies(gradle);
  const unlisted = declared.filter((one) => ANDROID_LIBRARIES[one.name] === undefined);
  if (unlisted.length > 0) {
    throw new AndroidLibraryUnlistedError(unlisted.map((one) => one.name));
  }
  return declared.map((one) => ({ ...one, licence: ANDROID_LIBRARIES[one.name] ?? APACHE }));
}

function desktopRuntime(): readonly ProductionPackage[] {
  const { version } = ELECTRON_MANIFEST.parse(
    JSON.parse(
      readFileSync(join(REPOSITORY_ROOT, 'node_modules', 'electron', 'package.json'), 'utf8'),
    ),
  );
  return [
    { name: 'electron', version, licence: 'MIT' },
    { name: 'chromium (inside electron)', version, licence: 'BSD-3-Clause' },
  ];
}

function webrtcBinary(): ProductionPackage {
  const gradle = readFileSync(
    join(REPOSITORY_ROOT, 'node_modules', 'react-native-webrtc', 'android', 'build.gradle'),
    'utf8',
  );
  const version = z.string().min(1).parse(WEBRTC_VERSION.exec(gradle)?.[1]);
  return { name: WEBRTC_BINARY, version, licence: 'BSD-3-Clause AND Apache-2.0 AND MIT' };
}

export function extraLicences(): readonly ProductionPackage[] {
  return [
    ...androidLibraries(readFileSync(ANDROID_GRADLE, 'utf8')),
    webrtcBinary(),
    ...desktopRuntime(),
  ];
}
