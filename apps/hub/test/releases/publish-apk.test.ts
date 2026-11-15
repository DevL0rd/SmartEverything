import { randomUUID, sign } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PairedAndroidBuild, ReleaseUpload } from '@smarteverything/domain';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AndroidApkFolder } from '../../src/app-updates/android-apk-folder';
import type { HubLayout } from '../../src/data-layout';
import { publishProvidedApk, type ProvidedApkPublication } from '../../src/releases/publish-apk';
import { trustReleaseKey } from '../../src/releases/trust';
import { testLayout } from '../support/test-layout';
import { APP_ID, SERVER, apkSigner, appFiles, signedApk, type ApkSigner } from './apk-fixture';
import { COMMIT, releaseSigner, scratch, sha256, type ReleaseSigner } from './release-fixture';

const NOW = new Date('2026-11-14T10:00:00.000Z');

let app: ApkSigner;
let foreign: ApkSigner;
let machine: ReleaseSigner;
let root: string;
let close: () => Promise<void>;
let layout: HubLayout;
let discarded: string[];

beforeAll(async () => {
  [app, foreign] = await Promise.all([apkSigner('app'), apkSigner('foreign')]);
  machine = releaseSigner();
});

beforeEach(async () => {
  ({ root, close } = await scratch());
  layout = await testLayout(join(root, 'data'));
  await trustReleaseKey(
    layout.system.keys.releaseKeys,
    { publicKey: machine.publicKey, role: 'machine', label: 'dev pc' },
    NOW,
  );
  discarded = [];
});

afterEach(async () => {
  await close();
});

interface BundleSpec {
  readonly apk: Buffer;
  readonly versionCode?: string;
  readonly signerSha256?: string;
  readonly applicationId?: string;
  readonly signer?: ReleaseSigner;
}

async function stagedBundle(spec: BundleSpec): Promise<string> {
  const directory = join(root, 'staged', randomUUID());
  await mkdir(join(directory, 'files'), { recursive: true });
  await writeFile(join(directory, 'files', 'app.apk'), spec.apk);
  const manifest = Buffer.from(
    JSON.stringify({
      artifact: 'apk',
      target: 'android',
      facts: {
        applicationId: spec.applicationId ?? APP_ID,
        versionCode: spec.versionCode ?? '200',
        signerSha256: spec.signerSha256 ?? app.sha256,
      },
      version: '1.4.0',
      commit: COMMIT,
      notes: 'A newer app.',
      files: [
        { path: 'app.apk', size: spec.apk.length, sha256: sha256(spec.apk), executable: false },
      ],
      gate: { typeCheck: 'passed', commit: COMMIT },
    }),
  );
  const signer = spec.signer ?? machine;
  await writeFile(join(directory, 'release.json'), manifest);
  await writeFile(
    join(directory, 'release.sig'),
    JSON.stringify({
      algorithm: 'ed25519',
      fingerprint: signer.fingerprint,
      signature: sign(null, manifest, signer.privateKey).toString('base64'),
    }),
  );
  return directory;
}

function target(versionCode: string): PairedAndroidBuild {
  return {
    clientId: randomUUID(),
    observation: {
      applicationId: APP_ID,
      versionCode,
      runtimeVersion: 'runtime-old',
      channel: 'release',
      currentUpdateId: null,
      observedAt: NOW.toISOString(),
      lastOutcome: null,
    },
  };
}

function publication(
  directory: string,
  installed = '150',
  state: ReleaseUpload['state'] = 'staged',
): ProvidedApkPublication {
  const uploadId = randomUUID();
  const upload: ReleaseUpload = {
    uploadId,
    artifact: 'apk',
    size: 1,
    sha256: 'a'.repeat(64),
    state,
    createdAt: NOW.toISOString(),
    received: [],
    receivedBytes: 0,
    release: null,
  };
  const paired = [target(installed)];
  return {
    layout,
    identity: { applicationId: APP_ID, signingCertificateSha256: app.sha256 },
    staging: {
      read: () => Promise.resolve(upload),
      releaseDirectory: () => directory,
      discard: (id: string): Promise<ReleaseUpload> => {
        discarded.push(id);
        return Promise.resolve(upload);
      },
    },
    upload: uploadId,
    runId: randomUUID(),
    clientId: null,
    notes: 'A newer app.',
    server: SERVER,
    targets: () => Promise.resolve(paired),
    now: () => NOW,
  };
}

describe('publishProvidedApk', () => {
  it('publishes a provided APK signed by the app key and discards its upload', async () => {
    const apk = signedApk({ signer: app, files: appFiles() });
    const input = publication(await stagedBundle({ apk }));
    const result = await publishProvidedApk(input);
    expect(result).toStrictEqual({
      status: 'published',
      runId: input.runId,
      publication: {
        id: input.runId,
        clientId: null,
        applicationId: APP_ID,
        versionCode: '200',
        runtimeVersion: 'runtime-abc',
        desktop: null,
      },
    });
    expect(discarded).toStrictEqual([input.upload]);
    const folder = new AndroidApkFolder(layout);
    const release = await folder.publicationFor('release', null, input.runId);
    expect(release).toMatchObject({ sha256: sha256(apk), abis: ['arm64-v8a', 'x86_64'] });
    if (release === null) throw new Error('missing release');
    expect(await readFile(await folder.downloadable(release))).toStrictEqual(apk);
    expect(await publishProvidedApk({ ...input, upload: randomUUID() })).toStrictEqual(result);
  });

  it('refuses an APK from a foreign signer even when the release names the app signer', async () => {
    const apk = signedApk({ signer: foreign, files: appFiles() });
    const input = publication(await stagedBundle({ apk }));
    const result = await publishProvidedApk(input);
    expect(result).toMatchObject({ status: 'refused', runId: input.runId });
    expect(JSON.stringify(result)).toContain('cannot install over the app');
    expect(discarded).toStrictEqual([input.upload]);
  });

  it('refuses an APK that is not signed by the signer the release names', async () => {
    const apk = signedApk({ signer: app, files: appFiles() });
    const result = await publishProvidedApk(
      publication(await stagedBundle({ apk, signerSha256: foreign.sha256 })),
    );
    expect(JSON.stringify(result)).toContain('cannot install over the app');
  });

  it('refuses a release made for another app ID', async () => {
    const apk = signedApk({ signer: app, files: appFiles() });
    const input = publication(await stagedBundle({ apk, applicationId: 'com.other.app' }));
    const result = await publishProvidedApk(input);
    expect(result).toMatchObject({ status: 'refused' });
    expect(JSON.stringify(result)).toContain(`not the app ${APP_ID}`);
    expect(discarded).toStrictEqual([input.upload]);
  });

  it('refuses an APK whose signing block is corrupt', async () => {
    const apk = signedApk({ signer: app, files: appFiles() });
    const magic = apk.indexOf('APK Sig Block 42');
    apk.writeBigUInt64LE(BigInt(apk.length * 2), magic - 8);
    const result = await publishProvidedApk(publication(await stagedBundle({ apk })));
    expect(result).toMatchObject({ status: 'refused' });
    expect(JSON.stringify(result)).toContain('signing_block');
  });

  it('refuses a versionCode that is not above the installed one', async () => {
    const apk = signedApk({ signer: app, files: appFiles() });
    const result = await publishProvidedApk(publication(await stagedBundle({ apk }), '200'));
    expect(JSON.stringify(result)).toContain('versionCode 200 is not above the installed 200');
  });

  it('refuses an APK whose versionCode differs from the signed release', async () => {
    const apk = signedApk({ signer: app, files: appFiles() });
    const result = await publishProvidedApk(
      publication(await stagedBundle({ apk, versionCode: '300' })),
    );
    expect(JSON.stringify(result)).toContain("differs from the release's 300");
  });

  it('refuses an upload that is not staged yet and keeps it', async () => {
    const apk = signedApk({ signer: app, files: appFiles() });
    const result = await publishProvidedApk(
      publication(await stagedBundle({ apk }), '150', 'receiving'),
    );
    expect(result).toMatchObject({ status: 'refused' });
    expect(JSON.stringify(result)).toContain('not_staged');
    expect(discarded).toStrictEqual([]);
    expect(await new AndroidApkFolder(layout).releaseFor('release', null)).toBeNull();
  });

  it('refuses an APK that changed after its release was staged', async () => {
    const apk = signedApk({ signer: app, files: appFiles() });
    const directory = await stagedBundle({ apk });
    const replaced = signedApk({
      signer: app,
      files: { ...appFiles(), 'extra.txt': Buffer.from('x') },
    });
    await writeFile(join(directory, 'files', 'app.apk'), replaced);
    const result = await publishProvidedApk(publication(directory));
    expect(JSON.stringify(result)).toContain('no longer matches the signed release');
  });
});
