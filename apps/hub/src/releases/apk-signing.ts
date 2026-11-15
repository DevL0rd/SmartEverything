import {
  constants,
  createHash,
  createPublicKey,
  verify,
  X509Certificate,
  type KeyObject,
} from 'node:crypto';
import { open } from 'node:fs/promises';
import { ApkFactsError } from './apk-error';
import { contentDigests, malformedBlock, pairsOf, zipLayout, type DigestHash } from './apk-zip';

const V2_ID = 0x7109871a;
const V3_ID = 0xf05368c0;
const V31_ID = 0x1b93ad61;

type KeyKind = 'rsa-pss' | 'rsa' | 'ec' | 'dsa';

interface Algorithm {
  readonly hash: DigestHash;
  readonly key: KeyKind;
}

const ALGORITHMS: ReadonlyMap<number, Algorithm> = new Map([
  [0x0101, { hash: 'sha256', key: 'rsa-pss' }],
  [0x0102, { hash: 'sha512', key: 'rsa-pss' }],
  [0x0103, { hash: 'sha256', key: 'rsa' }],
  [0x0104, { hash: 'sha512', key: 'rsa' }],
  [0x0201, { hash: 'sha256', key: 'ec' }],
  [0x0202, { hash: 'sha512', key: 'ec' }],
  [0x0301, { hash: 'sha256', key: 'dsa' }],
]);

const HASH_BYTES: Readonly<Record<DigestHash, number>> = { sha256: 32, sha512: 64 };

const KEY_TYPES: Readonly<Record<KeyKind, string>> = {
  'rsa-pss': 'rsa',
  rsa: 'rsa',
  ec: 'ec',
  dsa: 'dsa',
};

export type ApkSignatureScheme = 'v2' | 'v3';

export interface ApkSignature {
  readonly signerSha256: string;
  readonly schemes: readonly ApkSignatureScheme[];
  readonly entriesEnd: number;
  readonly size: number;
}

interface Tagged {
  readonly algorithm: number;
  readonly bytes: Buffer;
}

interface Signer {
  readonly signedData: Buffer;
  readonly digests: readonly Tagged[];
  readonly certificates: readonly Buffer[];
  readonly signatures: readonly Tagged[];
  readonly publicKey: Buffer;
}

interface CheckedSigner {
  readonly certificate: Buffer;
  readonly digests: ReadonlyMap<number, Buffer>;
}

interface SchemeSigner {
  readonly scheme: ApkSignatureScheme;
  readonly signer: CheckedSigner;
}

class Cursor {
  private at = 0;

  constructor(private readonly bytes: Buffer) {}

  get done(): boolean {
    return this.at === this.bytes.length;
  }

  u32(): number {
    if (this.at + 4 > this.bytes.length) malformedBlock('a number runs past its record');
    const value = this.bytes.readUInt32LE(this.at);
    this.at += 4;
    return value;
  }

  prefixed(): Buffer {
    const length = this.u32();
    if (this.at + length > this.bytes.length) malformedBlock('a record runs past its parent');
    const value = this.bytes.subarray(this.at, this.at + length);
    this.at += length;
    return value;
  }

  items(): readonly Buffer[] {
    const inner = new Cursor(this.prefixed());
    const items: Buffer[] = [];
    while (!inner.done) items.push(inner.prefixed());
    return items;
  }

  tagged(): readonly Tagged[] {
    return this.items().map((item) => {
      const cursor = new Cursor(item);
      return { algorithm: cursor.u32(), bytes: cursor.prefixed() };
    });
  }
}

function signedDataOf(bytes: Buffer): Pick<Signer, 'digests' | 'certificates'> & {
  readonly cursor: Cursor;
} {
  const cursor = new Cursor(bytes);
  const digests = cursor.tagged();
  const certificates = cursor.items();
  return { digests, certificates, cursor };
}

function v2Signer(bytes: Buffer): Signer {
  const cursor = new Cursor(bytes);
  const signedData = cursor.prefixed();
  const signatures = cursor.tagged();
  const publicKey = cursor.prefixed();
  const { digests, certificates } = signedDataOf(signedData);
  return { signedData, digests, certificates, signatures, publicKey };
}

function v3Signer(bytes: Buffer): Signer {
  const cursor = new Cursor(bytes);
  const signedData = cursor.prefixed();
  const minSdk = cursor.u32();
  const maxSdk = cursor.u32();
  const signatures = cursor.tagged();
  const publicKey = cursor.prefixed();
  const inner = signedDataOf(signedData);
  if (inner.cursor.u32() !== minSdk || inner.cursor.u32() !== maxSdk)
    malformedBlock('the v3 signer SDK range differs from its signed data');
  return {
    signedData,
    digests: inner.digests,
    certificates: inner.certificates,
    signatures,
    publicKey,
  };
}

function onlySigner(block: Buffer, scheme: ApkSignatureScheme): Buffer {
  const signers = new Cursor(block).items();
  const [signer] = signers;
  if (signer === undefined || signers.length !== 1)
    throw new ApkFactsError(
      'signers',
      `The ${scheme} signature must have exactly one signer, it has ${String(signers.length)}.`,
    );
  return signer;
}

function verifies(algorithm: Algorithm, key: KeyObject, data: Buffer, signature: Buffer): boolean {
  if (key.asymmetricKeyType !== KEY_TYPES[algorithm.key])
    throw new ApkFactsError(
      'public_key',
      `The signing key is ${String(key.asymmetricKeyType)}, but its signature algorithm needs ${KEY_TYPES[algorithm.key]}.`,
    );
  if (algorithm.key === 'rsa-pss')
    return verify(
      algorithm.hash,
      data,
      { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: HASH_BYTES[algorithm.hash] },
      signature,
    );
  if (algorithm.key === 'rsa')
    return verify(algorithm.hash, data, { key, padding: constants.RSA_PKCS1_PADDING }, signature);
  return verify(algorithm.hash, data, { key, dsaEncoding: 'der' }, signature);
}

function sortedIds(tags: readonly Tagged[]): string {
  return tags
    .map((tag) => tag.algorithm)
    .sort((a, b) => a - b)
    .join(',');
}

function causeText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function publicKeyOf(der: Buffer): KeyObject {
  try {
    return createPublicKey({ key: der, format: 'der', type: 'spki' });
  } catch (cause) {
    throw new ApkFactsError(
      'public_key',
      `The signer public key is not a DER SubjectPublicKeyInfo: ${causeText(cause)}.`,
      { cause },
    );
  }
}

function certificateKey(der: Buffer): Buffer {
  try {
    return new X509Certificate(der).publicKey.export({ type: 'spki', format: 'der' });
  } catch (cause) {
    throw new ApkFactsError(
      'public_key',
      `The signer certificate is not a DER X.509 certificate: ${causeText(cause)}.`,
      { cause },
    );
  }
}

function checkSignatures(signer: Signer, scheme: ApkSignatureScheme): void {
  const supported = signer.signatures.filter((signature) => ALGORITHMS.has(signature.algorithm));
  if (supported.length === 0)
    throw new ApkFactsError(
      'no_supported_signature',
      `The ${scheme} signer has no signature with a supported algorithm.`,
    );
  if (sortedIds(signer.signatures) !== sortedIds(signer.digests))
    throw new ApkFactsError(
      'signature',
      `The ${scheme} signature algorithms differ from its digest algorithms.`,
    );
  const key = publicKeyOf(signer.publicKey);
  for (const signature of supported) {
    const algorithm = ALGORITHMS.get(signature.algorithm);
    if (algorithm === undefined || !verifies(algorithm, key, signer.signedData, signature.bytes))
      throw new ApkFactsError('signature', `The ${scheme} signature does not verify.`);
  }
}

function supportedDigests(signer: Signer): ReadonlyMap<number, Buffer> {
  const digests = new Map<number, Buffer>();
  for (const digest of signer.digests) {
    if (!ALGORITHMS.has(digest.algorithm)) continue;
    if (digests.has(digest.algorithm)) malformedBlock('a digest algorithm appears twice');
    digests.set(digest.algorithm, digest.bytes);
  }
  return digests;
}

function checkedSigner(signer: Signer, scheme: ApkSignatureScheme): CheckedSigner {
  checkSignatures(signer, scheme);
  const [first] = signer.certificates;
  if (first === undefined)
    throw new ApkFactsError('public_key', `The ${scheme} signer has no certificate.`);
  if (!certificateKey(first).equals(signer.publicKey))
    throw new ApkFactsError(
      'public_key',
      `The ${scheme} signer certificate does not hold the key that made the signature.`,
    );
  return { certificate: first, digests: supportedDigests(signer) };
}

function schemeSigners(pairs: ReadonlyMap<number, Buffer>): readonly SchemeSigner[] {
  if (pairs.has(V31_ID))
    throw new ApkFactsError(
      'key_rotation',
      'The APK carries a v3.1 signature for signing key rotation, which the Hub does not accept.',
    );
  const v2 = pairs.get(V2_ID);
  const v3 = pairs.get(V3_ID);
  const schemes = [
    ...(v2 === undefined
      ? []
      : [{ scheme: 'v2' as const, signer: checkedSigner(v2Signer(onlySigner(v2, 'v2')), 'v2') }]),
    ...(v3 === undefined
      ? []
      : [{ scheme: 'v3' as const, signer: checkedSigner(v3Signer(onlySigner(v3, 'v3')), 'v3') }]),
  ];
  const [first] = schemes;
  if (first === undefined)
    throw new ApkFactsError('unsigned', 'The APK has neither a v2 nor a v3 signature.');
  if (schemes.some(({ signer }) => !signer.certificate.equals(first.signer.certificate)))
    throw new ApkFactsError(
      'signer_mismatch',
      'The v2 and v3 signatures are made with different certificates.',
    );
  return schemes;
}

function hashesOf(schemes: readonly SchemeSigner[]): ReadonlySet<DigestHash> {
  const hashes = new Set<DigestHash>();
  for (const { signer } of schemes)
    for (const id of signer.digests.keys()) {
      const algorithm = ALGORITHMS.get(id);
      if (algorithm !== undefined) hashes.add(algorithm.hash);
    }
  return hashes;
}

function checkDigests(
  schemes: readonly SchemeSigner[],
  measured: ReadonlyMap<DigestHash, Buffer>,
): void {
  for (const { scheme, signer } of schemes)
    for (const [id, digest] of signer.digests) {
      const algorithm = ALGORITHMS.get(id);
      const actual = algorithm === undefined ? undefined : measured.get(algorithm.hash);
      if (actual?.equals(digest) !== true)
        throw new ApkFactsError(
          'digest',
          `The APK contents do not match its ${scheme} signature; the file was changed after signing.`,
        );
    }
}

export async function verifyApkSignature(path: string): Promise<ApkSignature> {
  const file = await open(path, 'r');
  try {
    const layout = await zipLayout(file);
    const schemes = schemeSigners(pairsOf(layout.pairs));
    checkDigests(schemes, await contentDigests(file, layout, hashesOf(schemes)));
    const [first] = schemes;
    if (first === undefined) throw new ApkFactsError('unsigned', 'The APK has no signer.');
    return {
      signerSha256: createHash('sha256').update(first.signer.certificate).digest('hex'),
      schemes: schemes.map(({ scheme }) => scheme),
      entriesEnd: layout.blockStart,
      size: layout.size,
    };
  } finally {
    await file.close();
  }
}
