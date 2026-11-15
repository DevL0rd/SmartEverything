import { constants } from 'node:fs';
import { createHash, verify } from 'node:crypto';
import { lstat, open, readdir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import {
  RELEASE_FILES_DIRECTORY,
  RELEASE_MANIFEST,
  RELEASE_MANIFEST_FILE,
  RELEASE_SIGNATURE,
  RELEASE_SIGNATURE_FILE,
  type ReleaseArtifact,
  type ReleaseKeyRole,
  type ReleaseManifest,
} from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import { isMissing } from '../fs-util';
import { releasePublicKey, type TrustedReleaseKey } from './trust';

const log = new Logger('hub.releases');

const BUNDLE_ENTRIES: ReadonlySet<string> = new Set([
  RELEASE_MANIFEST_FILE,
  RELEASE_SIGNATURE_FILE,
  RELEASE_FILES_DIRECTORY,
]);

export const RELEASE_REFUSALS = [
  'layout',
  'unsafe_path',
  'signature',
  'unknown_key',
  'wrong_role',
  'bad_signature',
  'manifest',
  'wrong_artifact',
  'missing_file',
  'unlisted_file',
  'size_mismatch',
  'hash_mismatch',
  'mode_mismatch',
] as const;

export type ReleaseRefusal = (typeof RELEASE_REFUSALS)[number];

export class ReleaseVerificationError extends Error {
  override readonly name = 'ReleaseVerificationError';

  constructor(
    readonly reason: ReleaseRefusal,
    message: string,
  ) {
    super(message);
  }
}

export interface ReleaseExpectation {
  readonly keys: readonly TrustedReleaseKey[];
  readonly role: ReleaseKeyRole;
  readonly artifact: ReleaseArtifact;
}

export interface VerifiedRelease {
  readonly manifest: ReleaseManifest;
  readonly key: Pick<TrustedReleaseKey, 'fingerprint' | 'role' | 'label'>;
  readonly filesDirectory: string;
  readonly bytes: number;
}

const READ_CHUNK_BYTES = 1024 * 1024;

const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;

function refuse(reason: ReleaseRefusal, message: string): never {
  throw new ReleaseVerificationError(reason, message);
}

async function openRegular(path: string, shown: string): Promise<Awaited<ReturnType<typeof open>>> {
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(path, READ_FLAGS);
  } catch (cause) {
    if (isMissing(cause)) refuse('missing_file', `${shown} is missing`);
    if (cause instanceof Error && 'code' in cause && cause.code === 'ELOOP')
      refuse('unsafe_path', `${shown} is a link`);
    throw cause;
  }
  const stats = await handle.stat();
  if (!stats.isFile() || stats.nlink !== 1) {
    await handle.close();
    refuse('unsafe_path', `${shown} is not a plain file`);
  }
  return handle;
}

async function readRegular(path: string, shown: string): Promise<Buffer> {
  const handle = await openRegular(path, shown);
  try {
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function requireDirectory(path: string, shown: string): Promise<void> {
  const stats = await lstat(path).catch((cause: unknown) => {
    if (isMissing(cause)) refuse('layout', `${shown} is missing`);
    throw cause;
  });
  if (!stats.isDirectory()) refuse('unsafe_path', `${shown} is not a plain folder`);
}

async function checkLayout(root: string): Promise<void> {
  await requireDirectory(root, 'The release bundle');
  const entries = await readdir(root);
  const unexpected = entries.find((entry) => !BUNDLE_ENTRIES.has(entry));
  if (unexpected !== undefined)
    refuse('layout', `The bundle holds an unexpected entry ${unexpected}`);
  await requireDirectory(join(root, RELEASE_FILES_DIRECTORY), 'The files folder');
}

function signatureOf(bytes: Buffer): ReturnType<typeof RELEASE_SIGNATURE.parse> {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch (cause) {
    refuse('signature', `The release signature is not valid JSON: ${messageOf(cause)}`);
  }
  const parsed = RELEASE_SIGNATURE.safeParse(value);
  if (!parsed.success) refuse('signature', 'The release signature has the wrong shape');
  return parsed.data;
}

function signingKey(fingerprint: string, expectation: ReleaseExpectation): TrustedReleaseKey {
  const key = expectation.keys.find((candidate) => candidate.fingerprint === fingerprint);
  if (key === undefined)
    refuse('unknown_key', `The release is signed by an untrusted key ${fingerprint}`);
  if (key.role !== expectation.role)
    refuse(
      'wrong_role',
      `The key ${fingerprint} is a ${key.role} key, not a ${expectation.role} key`,
    );
  return key;
}

function manifestOf(bytes: Buffer, artifact: ReleaseArtifact): ReleaseManifest {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (cause) {
    refuse('manifest', `The release manifest is not valid JSON: ${messageOf(cause)}`);
  }
  const parsed = RELEASE_MANIFEST.safeParse(value);
  if (!parsed.success) {
    const unsafe = parsed.error.issues.some(
      (issue) => issue.path[0] === 'files' && issue.path[2] === 'path',
    );
    if (unsafe) refuse('unsafe_path', 'The release manifest lists an unsafe file path');
    refuse('manifest', 'The release manifest has the wrong shape');
  }
  if (parsed.data.artifact !== artifact)
    refuse('wrong_artifact', `The release is a ${parsed.data.artifact} release, not ${artifact}`);
  return parsed.data;
}

async function listedFiles(directory: string, prefix: string, found: Set<string>): Promise<void> {
  for (const entry of await readdir(directory)) {
    const path = join(directory, entry);
    const shown = prefix === '' ? entry : `${prefix}/${entry}`;
    const stats = await lstat(path);
    if (stats.isDirectory()) await listedFiles(path, shown, found);
    else if (stats.isFile() && stats.nlink === 1) found.add(shown);
    else refuse('unsafe_path', `${shown} is not a plain file or folder`);
  }
}

function insidePath(directory: string, path: string): string {
  const target = resolve(directory, ...path.split('/'));
  const offset = relative(directory, target);
  if (offset === '' || isAbsolute(offset) || offset === '..' || offset.startsWith('../'))
    refuse('unsafe_path', `${path} leaves the files folder`);
  return target;
}

async function checkFile(directory: string, file: ReleaseManifest['files'][number]): Promise<void> {
  const handle = await openRegular(insidePath(directory, file.path), file.path);
  const executable = ((await handle.stat()).mode & 0o111) !== 0;
  if (executable !== file.executable) {
    await handle.close();
    refuse(
      'mode_mismatch',
      `${file.path} is ${executable ? '' : 'not '}executable, but the manifest says it ${file.executable ? 'is' : 'is not'}`,
    );
  }
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(READ_CHUNK_BYTES);
  let size = 0;
  try {
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      size += bytesRead;
      if (size > file.size) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
  if (size !== file.size) refuse('size_mismatch', `${file.path} does not have its listed size`);
  if (hash.digest('hex') !== file.sha256)
    refuse('hash_mismatch', `${file.path} does not match its listed hash`);
}

async function checkFiles(directory: string, manifest: ReleaseManifest): Promise<number> {
  const found = new Set<string>();
  await listedFiles(directory, '', found);
  const listed = new Set(manifest.files.map((file) => file.path));
  const missing = manifest.files.find((file) => !found.has(file.path));
  if (missing !== undefined) refuse('missing_file', `${missing.path} is missing`);
  const unlisted = [...found].find((path) => !listed.has(path));
  if (unlisted !== undefined) refuse('unlisted_file', `${unlisted} is not listed in the manifest`);
  let bytes = 0;
  for (const file of manifest.files) {
    await checkFile(directory, file);
    bytes += file.size;
  }
  return bytes;
}

async function verified(root: string, expectation: ReleaseExpectation): Promise<VerifiedRelease> {
  await checkLayout(root);
  const manifestBytes = await readRegular(join(root, RELEASE_MANIFEST_FILE), RELEASE_MANIFEST_FILE);
  const signature = signatureOf(
    await readRegular(join(root, RELEASE_SIGNATURE_FILE), RELEASE_SIGNATURE_FILE),
  );
  const key = signingKey(signature.fingerprint, expectation);
  const signed = verify(
    null,
    manifestBytes,
    releasePublicKey(key.publicKey),
    Buffer.from(signature.signature, 'base64'),
  );
  if (!signed) refuse('bad_signature', 'The release signature does not match its manifest');
  const manifest = manifestOf(manifestBytes, expectation.artifact);
  const filesDirectory = join(root, RELEASE_FILES_DIRECTORY);
  const bytes = await checkFiles(filesDirectory, manifest);
  return {
    manifest,
    key: { fingerprint: key.fingerprint, role: key.role, label: key.label },
    filesDirectory,
    bytes,
  };
}

export async function verifyRelease(
  root: string,
  expectation: ReleaseExpectation,
): Promise<VerifiedRelease> {
  try {
    const release = await verified(root, expectation);
    log.info('release.verified', {
      artifact: release.manifest.artifact,
      version: release.manifest.version,
      commit: release.manifest.commit,
      fingerprint: release.key.fingerprint,
      files: release.manifest.files.length,
      bytes: release.bytes,
    });
    return release;
  } catch (cause) {
    if (cause instanceof ReleaseVerificationError)
      log.warn('release.refused', { artifact: expectation.artifact, reason: cause.reason });
    throw cause;
  }
}
