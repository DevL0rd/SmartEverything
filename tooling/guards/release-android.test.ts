import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import appConfig from '../../apps/app/app.config.ts';
import {
  buildEnvironment,
  gradleCommand,
  gradleTask,
  prebuildCommand,
  type BuildOptions,
} from '../release-android.ts';
import {
  identityProblems,
  parseBadging,
  parseFingerprint,
  parseMetaData,
  parseSigner,
  readAppIdentity,
  releaseProblems,
  runtimeVersionOf,
  signingProblems,
  updateProblems,
  type ApkExpectation,
  type ApkFacts,
} from '../release-apk.ts';
import { SMOKE_STEPS, stepsCovered } from '../release-smoke.ts';

const APP_SIGNER = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c';
const OTHER_SIGNER = '0'.repeat(64);
const SERVER = 'https://hub.example.test';
const URL_KEY = 'expo.modules.updates.EXPO_UPDATE_URL';
const RUNTIME_KEY = 'expo.modules.updates.EXPO_RUNTIME_VERSION';
const CERTIFICATE_KEY = 'expo.modules.updates.CODE_SIGNING_CERTIFICATE';

const XMLTREE = `N: android=http://schemas.android.com/apk/res/android (line=2)
  E: manifest (line=2)
    A: package="com.devl0rd.smarteverything.dev" (Raw: "com.devl0rd.smarteverything.dev")
    E: application (line=10)
      E: meta-data (line=20)
        A: http://schemas.android.com/apk/res/android:name(0x01010003)="expo.modules.updates.EXPO_UPDATE_URL" (Raw: "expo.modules.updates.EXPO_UPDATE_URL")
        A: http://schemas.android.com/apk/res/android:value(0x01010024)="https://hub.example.test/api/app-update/manifest" (Raw: "https://hub.example.test/api/app-update/manifest")
      E: meta-data (line=23)
        A: http://schemas.android.com/apk/res/android:name(0x01010003)="expo.modules.updates.EXPO_RUNTIME_VERSION" (Raw: "expo.modules.updates.EXPO_RUNTIME_VERSION")
        A: http://schemas.android.com/apk/res/android:value(0x01010024)="b3a0c7" (Raw: "b3a0c7")
      E: meta-data (line=26)
        A: http://schemas.android.com/apk/res/android:name(0x01010003)="expo.modules.updates.CODE_SIGNING_CERTIFICATE" (Raw: "expo.modules.updates.CODE_SIGNING_CERTIFICATE")
        A: http://schemas.android.com/apk/res/android:value(0x01010024)="-----BEGIN CERTIFICATE-----
MIIC
-----END CERTIFICATE-----
" (Raw: "-----BEGIN CERTIFICATE-----
MIIC
-----END CERTIFICATE-----
")
      E: meta-data (line=30)
        A: http://schemas.android.com/apk/res/android:name(0x01010003)="firebase_messaging_auto_init_enabled" (Raw: "firebase_messaging_auto_init_enabled")
        A: http://schemas.android.com/apk/res/android:value(0x01010024)=(type 0x12)0x0
      E: activity (line=40)
        A: http://schemas.android.com/apk/res/android:name(0x01010003)="expo.modules.updates.EXPO_UPDATE_URL" (Raw: "expo.modules.updates.EXPO_UPDATE_URL")
`;

const UPDATE_META = {
  [URL_KEY]: `${SERVER}/api/app-update/manifest`,
  [RUNTIME_KEY]: 'b3a0c7',
  [CERTIFICATE_KEY]: '-----BEGIN CERTIFICATE-----\nMIIC\n-----END CERTIFICATE-----\n',
};

const BADGING = `package: name='com.devl0rd.smarteverything.dev' versionCode='31000000' versionName='0.1.0' platformBuildVersionName='16'
sdkVersion:'26'
uses-permission: name='android.permission.INTERNET'
uses-permission: name='android.permission.health.READ_STEPS'
application-debuggable
`;

const RELEASE: BuildOptions = {
  variant: 'release',
  server: 'https://hub.example.test',
  out: '/tmp/out',
  abi: 'arm64-v8a',
  bundle: false,
  above: 2,
};

const FACTS: ApkFacts = {
  file: 'x.apk',
  packageName: 'com.devl0rd.smarteverything.dev',
  versionCode: 31000000,
  versionName: '0.1.0',
  debuggable: false,
  permissions: [],
  signerSha256: APP_SIGNER,
  signatureVerifies: true,
  includesDevLauncher: false,
  metaData: UPDATE_META,
  fingerprint: null,
};

const EXPECTED: ApkExpectation = {
  variant: 'release',
  applicationId: 'com.devl0rd.smarteverything.dev',
  signingCertificateSha256: APP_SIGNER,
  versionName: '0.1.0',
  versionCodeAbove: 2,
  server: SERVER,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('reading an APK', () => {
  it('takes the package, numbers, permissions and debuggable flag from aapt2 badging', () => {
    expect(parseBadging(BADGING)).toEqual({
      packageName: 'com.devl0rd.smarteverything.dev',
      versionCode: 31000000,
      versionName: '0.1.0',
      debuggable: true,
      permissions: ['android.permission.INTERNET', 'android.permission.health.READ_STEPS'],
    });
  });

  it('refuses badging output that has no package line', () => {
    expect(() => parseBadging('nothing useful')).toThrow('no package line');
  });

  it('takes the certificate digest of the first signer from apksigner output', () => {
    expect(
      parseSigner(
        `Signer #1 certificate DN: CN=Android Debug, O=Unknown\nSigner #1 certificate SHA-256 digest: ${APP_SIGNER}\n`,
      ),
    ).toBe(APP_SIGNER);
    expect(parseSigner('')).toBeNull();
  });
});

describe('judging an APK', () => {
  it('accepts a signed, non-debuggable release with the right identity', () => {
    expect(identityProblems(FACTS, EXPECTED)).toEqual([]);
    expect(signingProblems(FACTS, EXPECTED)).toEqual([]);
    expect(releaseProblems(FACTS, EXPECTED)).toEqual([]);
  });

  it('names a wrong package, a wrong release number and a version code that is not newer', () => {
    const wrong = { ...FACTS, packageName: 'x.dev', versionName: '9.9.9', versionCode: 2 };
    expect(identityProblems(wrong, EXPECTED).map((one) => one.message)).toEqual([
      'package is x.dev, expected com.devl0rd.smarteverything.dev',
      'versionName is 9.9.9, expected 0.1.0',
      'versionCode 2 is not above 2',
    ]);
  });

  it('expects the same package and signer for a development build', () => {
    const development = { ...EXPECTED, variant: 'development' } as const;
    expect(identityProblems(FACTS, development)).toEqual([]);
    expect(signingProblems(FACTS, development)).toEqual([]);
  });

  it('refuses a release that is debuggable or carries the dev launcher', () => {
    const steps = releaseProblems(
      { ...FACTS, debuggable: true, includesDevLauncher: true },
      EXPECTED,
    ).map((one) => one.step);
    expect(steps).toEqual(['apk-not-debuggable', 'apk-not-debuggable']);
  });

  it('refuses an APK signed with another certificate, unsigned or not verifying', () => {
    expect(signingProblems({ ...FACTS, signerSha256: OTHER_SIGNER }, EXPECTED)).toHaveLength(1);
    expect(signingProblems({ ...FACTS, signatureVerifies: false }, EXPECTED)).toHaveLength(1);
    expect(signingProblems({ ...FACTS, signerSha256: null }, EXPECTED)).toHaveLength(1);
  });

  it('pins the app to the installed id and its signing certificate', () => {
    expect(readAppIdentity()).toEqual({
      applicationId: 'com.devl0rd.smarteverything.dev',
      signingCertificateSha256: APP_SIGNER,
    });
  });

  it('does not hold a development build to the release rules', () => {
    expect(
      releaseProblems({ ...FACTS, debuggable: true }, { ...EXPECTED, variant: 'development' }),
    ).toEqual([]);
  });
});

describe('checking the update settings of a release APK', () => {
  it('reads only the meta-data elements and keeps a value that spans lines', () => {
    const meta = parseMetaData(XMLTREE);
    expect(meta[URL_KEY]).toBe(`${SERVER}/api/app-update/manifest`);
    expect(meta[RUNTIME_KEY]).toBe('b3a0c7');
    expect(meta[CERTIFICATE_KEY]).toBe(UPDATE_META[CERTIFICATE_KEY]);
    expect(meta['firebase_messaging_auto_init_enabled']).toBe('0x0');
    expect(Object.keys(meta)).toHaveLength(4);
  });

  it('reads meta-data entries that point at a resource or hold a plain typed value', () => {
    const meta = parseMetaData(`    E: application (line=10)
      E: meta-data (line=312)
        A: http://schemas.android.com/apk/res/android:name(0x01010003)="com.google.firebase.messaging.default_notification_color" (Raw: "com.google.firebase.messaging.default_notification_color")
        A: http://schemas.android.com/apk/res/android:resource(0x01010025)=@0x7f0603bb
      E: meta-data (line=330)
        A: http://schemas.android.com/apk/res/android:name(0x01010003)="expo.modules.updates.ENABLED" (Raw: "expo.modules.updates.ENABLED")
        A: http://schemas.android.com/apk/res/android:value(0x01010024)=true
      E: meta-data (line=333)
        A: http://schemas.android.com/apk/res/android:name(0x01010003)="expo.modules.updates.EXPO_UPDATES_LAUNCH_WAIT_MS" (Raw: "expo.modules.updates.EXPO_UPDATES_LAUNCH_WAIT_MS")
        A: http://schemas.android.com/apk/res/android:value(0x01010024)=0
`);
    expect(meta).toEqual({
      'com.google.firebase.messaging.default_notification_color': '@0x7f0603bb',
      'expo.modules.updates.ENABLED': 'true',
      'expo.modules.updates.EXPO_UPDATES_LAUNCH_WAIT_MS': '0',
    });
  });

  it('accepts the update URL, runtime version and certificate that the build wrote', () => {
    expect(updateProblems(FACTS, EXPECTED)).toEqual([]);
    expect(runtimeVersionOf(FACTS)).toBe('b3a0c7');
  });

  it('names each missing item on its own', () => {
    const without = (key: string): ApkFacts => ({
      ...FACTS,
      metaData: Object.fromEntries(Object.entries(UPDATE_META).filter(([name]) => name !== key)),
    });
    expect(updateProblems(without(URL_KEY), EXPECTED).map((one) => one.message)).toEqual([
      `the manifest has no ${URL_KEY}, so the app cannot update`,
    ]);
    expect(updateProblems(without(RUNTIME_KEY), EXPECTED).map((one) => one.message)).toEqual([
      `the manifest has no ${RUNTIME_KEY}`,
    ]);
    expect(updateProblems(without(CERTIFICATE_KEY), EXPECTED).map((one) => one.message)).toEqual([
      `the manifest has no ${CERTIFICATE_KEY}, so update signatures cannot be checked`,
    ]);
    expect(updateProblems({ ...FACTS, metaData: {} }, EXPECTED)).toHaveLength(3);
  });

  it('treats an empty runtime version without a fingerprint asset as missing', () => {
    const empty = { ...FACTS, metaData: { ...UPDATE_META, [RUNTIME_KEY]: '' } };
    expect(runtimeVersionOf(empty)).toBeNull();
    expect(updateProblems(empty, EXPECTED)).toHaveLength(1);
  });

  it('reads the runtime from the fingerprint asset when the manifest holds a resource reference', () => {
    const reference = XMLTREE.replace(
      /(EXPO_RUNTIME_VERSION" \(Raw: "expo.modules.updates.EXPO_RUNTIME_VERSION"\)\n\s+A: [^\n]*:value\(0x01010024\)=)"b3a0c7" \(Raw: "b3a0c7"\)/u,
      '$1@0x7f0f0003',
    );
    const meta = parseMetaData(reference);
    expect(meta[RUNTIME_KEY]).toBe('@0x7f0f0003');
    const facts = { ...FACTS, metaData: meta, fingerprint: parseFingerprint('9d41c2e07a\n') };
    expect(runtimeVersionOf(facts)).toBe('9d41c2e07a');
    expect(updateProblems(facts, EXPECTED)).toEqual([]);
    const placeholder = {
      ...facts,
      metaData: { ...meta, [RUNTIME_KEY]: 'file:fingerprint' },
    };
    expect(runtimeVersionOf(placeholder)).toBe('9d41c2e07a');
  });

  it('names a reference runtime whose fingerprint asset is missing or empty', () => {
    const reference = { ...FACTS, metaData: { ...UPDATE_META, [RUNTIME_KEY]: '@0x7f0f0003' } };
    expect(parseFingerprint('\n')).toBeNull();
    for (const fingerprint of [null, parseFingerprint('  \n')]) {
      expect(
        updateProblems({ ...reference, fingerprint }, EXPECTED).map((one) => one.message),
      ).toEqual([
        `the manifest takes the runtime version from assets/fingerprint (${RUNTIME_KEY} is @0x7f0f0003), but the APK has no such file or it is empty`,
      ]);
    }
  });

  it('refuses an update URL that points at another server', () => {
    const other = {
      ...FACTS,
      metaData: { ...UPDATE_META, [URL_KEY]: 'https://other.test/api/app-update/manifest' },
    };
    expect(updateProblems(other, EXPECTED).map((one) => one.message)).toEqual([
      `the update URL is https://other.test/api/app-update/manifest, expected ${SERVER}/api/app-update/manifest`,
    ]);
  });

  it('checks only the manifest path when no server is given', () => {
    const unnamed: ApkExpectation = {
      variant: 'release',
      applicationId: EXPECTED.applicationId,
      signingCertificateSha256: EXPECTED.signingCertificateSha256,
      versionName: EXPECTED.versionName,
      versionCodeAbove: EXPECTED.versionCodeAbove,
    };
    expect(updateProblems(FACTS, unnamed)).toEqual([]);
    const wrong = { ...FACTS, metaData: { ...UPDATE_META, [URL_KEY]: `${SERVER}/elsewhere` } };
    expect(updateProblems(wrong, unnamed)).toHaveLength(1);
  });

  it('does not ask a development build for update settings', () => {
    expect(
      updateProblems({ ...FACTS, metaData: {} }, { ...EXPECTED, variant: 'development' }),
    ).toEqual([]);
  });

  it('reads the runtime from the verified copied APK facts', () => {
    const copied = { ...FACTS, file: '/out/SmartEverything-release.apk' };
    expect(runtimeVersionOf(copied)).toBe(UPDATE_META[RUNTIME_KEY]);
    expect(runtimeVersionOf({ ...copied, metaData: {} })).toBeNull();
  });
});

describe('the code signing certificate of the app', () => {
  const certificate = join(
    import.meta.dirname,
    '..',
    '..',
    'apps',
    'app',
    'certs',
    'app-update-certificate.pem',
  );

  function releaseUpdates(): ReturnType<typeof appConfig>['updates'] {
    vi.stubEnv('EXPO_PUBLIC_SERVER_URL', SERVER);
    vi.stubEnv('ANDROID_VARIANT', 'release');
    return appConfig().updates;
  }

  it('is a public certificate and no private key sits beside it', () => {
    expect(readFileSync(certificate, 'utf8')).toMatch(/^-----BEGIN CERTIFICATE-----\r?\n/u);
    expect(readFileSync(certificate, 'utf8')).not.toContain('PRIVATE KEY');
    expect(existsSync(join(certificate, '..', 'private-key.pem'))).toBe(false);
  });

  it('is named by the release build with the key id and algorithm the hub signs with', () => {
    const updates = releaseUpdates();
    expect(updates?.codeSigningCertificate).toBe('./certs/app-update-certificate.pem');
    expect(updates?.codeSigningMetadata).toEqual({ keyid: 'main', alg: 'rsa-v1_5-sha256' });
  });

  it('declares no request headers, so the built-in and every downloaded update stay launchable', () => {
    expect(releaseUpdates()).not.toHaveProperty('requestHeaders');
  });

  it('is not named by the development build', () => {
    vi.stubEnv('EXPO_PUBLIC_SERVER_URL', SERVER);
    vi.stubEnv('ANDROID_VARIANT', 'development');
    expect(appConfig().updates).toEqual({ enabled: false });
  });
});

describe('the Android build commands', () => {
  it('builds the release with a clean project and production mode', () => {
    const prebuild = prebuildCommand(RELEASE);
    expect(prebuild.args).toContain('--clean');
    expect(prebuild.environment['NODE_ENV']).toBe('production');
    expect(prebuild.environment['EXPO_PUBLIC_SERVER_URL']).toBe('https://hub.example.test');
    expect(gradleTask(RELEASE)).toBe('assembleRelease');
  });

  it('builds the development variant with a clean project as a debug build', () => {
    const development: BuildOptions = { ...RELEASE, variant: 'development' };
    expect(prebuildCommand(development).args).toContain('--clean');
    expect(buildEnvironment(development)['NODE_ENV']).toBe('development');
    expect(gradleTask(development)).toBe('assembleDebug');
  });

  it('builds a bundle only for a release and passes an explicit version code through', () => {
    expect(gradleTask({ ...RELEASE, bundle: true })).toBe('bundleRelease');
    expect(buildEnvironment({ ...RELEASE, versionCode: 31000001 })['ANDROID_VERSION_CODE']).toBe(
      '31000001',
    );
  });

  it('runs gradle for one architecture, offline, through the shared build runner', () => {
    const gradle = gradleCommand(RELEASE);
    expect(gradle.program).toBe(join(import.meta.dirname, '..', '..', 'tmp', 'lockrun.sh'));
    expect(gradle.args.slice(0, 4)).toEqual(['gradle', '1', './gradlew', 'assembleRelease']);
    expect(gradle.args).toContain('--offline');
    expect(gradle.args).toContain('-PreactNativeArchitectures=arm64-v8a');
    expect(gradleCommand({ ...RELEASE, abi: 'x86_64' }).args).toContain(
      '-PreactNativeArchitectures=x86_64',
    );
  });

  it('builds the shared installer with both supported architectures', () => {
    expect(gradleCommand({ ...RELEASE, abi: 'universal' }).args).toContain(
      '-PreactNativeArchitectures=arm64-v8a,x86_64',
    );
  });
});

describe('the smoke test list', () => {
  it('gives every step its own id', () => {
    const ids = SMOKE_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has automatic steps for the APK and the hub and manual ones for every area', () => {
    expect(stepsCovered('apk').map((step) => step.id)).toEqual([
      'apk-identity',
      'apk-signed',
      'apk-not-debuggable',
      'apk-permissions',
    ]);
    expect(stepsCovered('hub').map((step) => step.id)).toEqual(['hub-up']);
    for (const area of ['phone', 'desktop', 'hub'] as const) {
      expect(stepsCovered('manual').filter((step) => step.area === area).length).toBeGreaterThan(0);
    }
  });
});
