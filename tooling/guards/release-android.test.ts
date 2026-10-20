import { describe, expect, it } from 'vitest';
import {
  buildEnvironment,
  gradleCommand,
  gradleLock,
  gradleTask,
  prebuildCommand,
  type BuildOptions,
} from '../release-android.ts';
import {
  identityProblems,
  parseBadging,
  parseSigner,
  readAppIdentity,
  releaseProblems,
  signingProblems,
  type ApkExpectation,
  type ApkFacts,
} from '../release-apk.ts';
import { SMOKE_STEPS, stepsCovered } from '../release-smoke.ts';

const APP_SIGNER = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c';
const OTHER_SIGNER = '0'.repeat(64);

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
};

const EXPECTED: ApkExpectation = {
  variant: 'release',
  applicationId: 'com.devl0rd.smarteverything.dev',
  signingCertificateSha256: APP_SIGNER,
  versionName: '0.1.0',
  versionCodeAbove: 2,
};

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

describe('the Android build commands', () => {
  it('builds the release with a clean project and production mode', () => {
    const prebuild = prebuildCommand(RELEASE);
    expect(prebuild.args).toContain('--clean');
    expect(prebuild.environment['NODE_ENV']).toBe('production');
    expect(prebuild.environment['EXPO_PUBLIC_SERVER_URL']).toBe('https://hub.example.test');
    expect(gradleTask(RELEASE)).toBe('assembleRelease');
  });

  it('builds the development variant incrementally as a debug build', () => {
    const development: BuildOptions = { ...RELEASE, variant: 'development' };
    expect(prebuildCommand(development).args).not.toContain('--clean');
    expect(buildEnvironment(development)['NODE_ENV']).toBe('development');
    expect(gradleTask(development)).toBe('assembleDebug');
  });

  it('builds a bundle only for a release and passes an explicit version code through', () => {
    expect(gradleTask({ ...RELEASE, bundle: true })).toBe('bundleRelease');
    expect(buildEnvironment({ ...RELEASE, versionCode: 31000001 })['ANDROID_VERSION_CODE']).toBe(
      '31000001',
    );
  });

  it('runs gradle for one architecture, offline, behind the shared gradle lock', () => {
    const gradle = gradleCommand(RELEASE);
    expect(gradle.program).toBe('flock');
    expect(gradle.args).toContain(gradleLock());
    expect(gradle.args).toContain('--offline');
    expect(gradle.args).toContain('-PreactNativeArchitectures=arm64-v8a');
    expect(gradleCommand({ ...RELEASE, abi: 'x86_64' }).args).toContain(
      '-PreactNativeArchitectures=x86_64',
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
