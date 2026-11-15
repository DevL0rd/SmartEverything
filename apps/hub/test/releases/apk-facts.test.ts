import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApkFactsError } from '../../src/releases/apk-error';
import { readApkFacts } from '../../src/releases/apk-facts';
import { apkFactProblems, type ApkExpectation } from '../../src/releases/publish-apk';
import { APP_ID, SERVER, apkSigner, appFiles, signedApk, type ApkSigner } from './apk-fixture';
import { scratch } from './release-fixture';

let app: ApkSigner;
let foreign: ApkSigner;
let root: string;
let close: () => Promise<void>;

beforeAll(async () => {
  [app, foreign] = await Promise.all([apkSigner('app'), apkSigner('foreign')]);
});

beforeEach(async () => {
  ({ root, close } = await scratch());
});

afterEach(async () => {
  await close();
});

async function written(bytes: Buffer): Promise<string> {
  const path = join(root, 'app.apk');
  await writeFile(path, bytes);
  return path;
}

function expectation(): ApkExpectation {
  return {
    identity: { applicationId: APP_ID, signingCertificateSha256: app.sha256 },
    versionName: '1.4.0',
    server: SERVER,
  };
}

async function refusal(bytes: Buffer): Promise<string> {
  const failure: unknown = await readApkFacts(await written(bytes)).catch(
    (cause: unknown) => cause,
  );
  if (!(failure instanceof ApkFactsError))
    throw new Error(`expected an ApkFactsError, got ${String(failure)}`);
  return failure.reason;
}

describe('readApkFacts', () => {
  it('reads and verifies the facts of an APK signed by the app key', async () => {
    const facts = await readApkFacts(await written(signedApk({ signer: app, files: appFiles() })));
    expect(facts).toMatchObject({
      packageName: APP_ID,
      versionCode: 200,
      versionName: '1.4.0',
      debuggable: false,
      signerSha256: app.sha256,
      schemes: ['v2'],
      fingerprint: 'runtime-abc',
      includesDevLauncher: false,
      abis: ['arm64-v8a', 'x86_64'],
    });
    expect(facts.metaData['expo.modules.updates.CODE_SIGNING_CERTIFICATE']).toBe('certificate');
    expect(apkFactProblems(facts, expectation(), 199)).toStrictEqual([]);
  });

  it('verifies v2 and v3 together', async () => {
    const facts = await readApkFacts(
      await written(signedApk({ signer: app, files: appFiles(), v3: true })),
    );
    expect(facts.schemes).toStrictEqual(['v2', 'v3']);
  });

  it('refuses v2 and v3 signatures made by different certificates', async () => {
    expect(
      await refusal(signedApk({ signer: app, files: appFiles(), v3: true, v3Signer: foreign })),
    ).toBe('signer_mismatch');
  });

  it('measures a foreign signer, which cannot install over the app', async () => {
    const facts = await readApkFacts(
      await written(signedApk({ signer: foreign, files: appFiles() })),
    );
    expect(facts.signerSha256).toBe(foreign.sha256);
    expect(apkFactProblems(facts, expectation(), 199).join('\n')).toContain(
      'cannot install over the app',
    );
  });

  it('refuses a corrupt signature', async () => {
    const bytes = signedApk({ signer: app, files: appFiles() });
    const magic = bytes.indexOf('APK Sig Block 42');
    const inSignature = magic - 8 - 4 - app.publicKey.length - 10;
    bytes[inSignature] = (bytes[inSignature] ?? 0) ^ 0xff;
    expect(await refusal(bytes)).toBe('signature');
  });

  it('refuses a damaged signing block size', async () => {
    const bytes = signedApk({ signer: app, files: appFiles() });
    const magic = bytes.indexOf('APK Sig Block 42');
    bytes.writeBigUInt64LE(BigInt(bytes.length * 2), magic - 8);
    expect(await refusal(bytes)).toBe('signing_block');
  });

  it('refuses an APK changed after signing', async () => {
    const bytes = signedApk({ signer: app, files: appFiles() });
    const at = bytes.indexOf('runtime-abc');
    bytes[at] = 'R'.charCodeAt(0);
    expect(await refusal(bytes)).toBe('digest');
  });

  it('refuses an APK without a signing block', async () => {
    const bytes = signedApk({ signer: app, files: appFiles() });
    const magic = bytes.indexOf('APK Sig Block 42');
    bytes.write('APK Sig Block 00', magic, 'latin1');
    expect(await refusal(bytes)).toBe('unsigned');
  });

  it('refuses a ZIP comment', async () => {
    const bytes = signedApk({ signer: app, files: appFiles() });
    const padded = Buffer.concat([bytes, Buffer.from('xx')]);
    padded.writeUInt16LE(2, bytes.length - 2);
    expect(await refusal(padded)).toBe('zip_comment');
  });

  it('reports a versionCode that is not above the installed one', async () => {
    const facts = await readApkFacts(
      await written(signedApk({ signer: app, files: appFiles({ versionCode: 150 }) })),
    );
    expect(apkFactProblems(facts, expectation(), 150)).toStrictEqual([
      'versionCode 150 is not above the installed 150',
    ]);
  });

  it('reports a debuggable APK and a wrong update URL', async () => {
    const facts = await readApkFacts(
      await written(
        signedApk({
          signer: app,
          files: appFiles({
            debuggable: true,
            metaData: {
              'expo.modules.updates.EXPO_UPDATE_URL':
                'https://other.example/api/app-update/manifest',
              'expo.modules.updates.EXPO_RUNTIME_VERSION': '1.0.0',
            },
          }),
        }),
      ),
    );
    expect(apkFactProblems(facts, expectation(), 1)).toStrictEqual([
      'the release APK is debuggable',
      `the update URL is https://other.example/api/app-update/manifest, expected ${SERVER}/api/app-update/manifest`,
      'the manifest has no expo.modules.updates.CODE_SIGNING_CERTIFICATE, so update signatures cannot be checked',
    ]);
  });
});
