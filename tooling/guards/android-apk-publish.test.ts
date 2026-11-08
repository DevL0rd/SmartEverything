import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AndroidAppObservation } from '@smarteverything/domain';
import { expect, it, vi } from 'vitest';
import { testLayout } from '../../apps/hub/test/support/test-layout.ts';
import { publishAndroidApk, type AndroidApkPublication } from '../android-apk-publish.ts';
import { expectedHealthPermissions, readApk, readAppIdentity } from '../release-apk.ts';
import { readReleaseVersion } from '../release-version.ts';

vi.mock(import('node:child_process'), async (original) => ({
  ...(await original()),
  execFileSync: (): string =>
    ['libreactnative.so', 'libhermesvm.so', 'libc++_shared.so']
      .map((name) => `lib/arm64-v8a/${name}`)
      .join('\n'),
}));

vi.mock(
  import('../release-apk.ts'),
  async (original): Promise<Awaited<ReturnType<typeof original>>> => ({
    ...(await original()),
    readApk: vi.fn<typeof readApk>(),
  }),
);

it('publishes a newer signed APK that retains OTA compatibility and rejects the same offered build', async () => {
  const base = await mkdtemp(join(tmpdir(), 'android-apk-publish-'));
  try {
    const data = await testLayout(join(base, 'data'));
    const apk = join(base, 'release.apk');
    const server = 'https://hub.example.test';
    const identity = readAppIdentity();
    const appVersion = readReleaseVersion('app');
    const observation: AndroidAppObservation = {
      applicationId: identity.applicationId,
      versionCode: '29899442',
      runtimeVersion: 'compatible-runtime',
      channel: 'release',
      currentUpdateId: null,
      observedAt: '2026-11-06T00:00:00.000Z',
    };
    await writeFile(apk, 'apk bytes');
    vi.mocked(readApk).mockReturnValue({
      file: apk,
      packageName: identity.applicationId,
      versionCode: 29899443,
      versionName: appVersion,
      debuggable: false,
      permissions: await expectedHealthPermissions(),
      signerSha256: identity.signingCertificateSha256,
      signatureVerifies: true,
      includesDevLauncher: false,
      fingerprint: observation.runtimeVersion,
      metaData: {
        'expo.modules.updates.EXPO_UPDATE_URL': `${server}/api/app-update/manifest`,
        'expo.modules.updates.EXPO_RUNTIME_VERSION': 'file:fingerprint',
        'expo.modules.updates.CODE_SIGNING_CERTIFICATE': 'certificate',
      },
    });
    const input: AndroidApkPublication = {
      runId: randomUUID(),
      data,
      clientId: randomUUID(),
      observation,
      readObservation: () => Promise.resolve(observation),
      apk,
      server,
      notes: 'Install the newer signed release.',
    };
    expect(await publishAndroidApk(input)).toMatchObject({
      build: { applicationId: identity.applicationId, versionCode: '29899443' },
      runtimeVersion: observation.runtimeVersion,
      appVersion,
    });
    await expect(publishAndroidApk({ ...input, runId: randomUUID() })).rejects.toThrow(
      'A newer or equal Android installer is already offered.',
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
