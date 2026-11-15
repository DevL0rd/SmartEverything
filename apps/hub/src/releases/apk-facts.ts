import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { ANDROID_APK_ABIS, type AndroidApkRelease } from '@smarteverything/domain';
import {
  closeZip,
  openEntryStream,
  openZip,
  readEntryBytes,
  visitEntries,
  ZipReadError,
  type Entry,
  type ZipFile,
} from '../drive/content/zip-file';
import { ApkFactsError } from './apk-error';
import { verifyApkSignature, type ApkSignatureScheme } from './apk-signing';
import { parseBinaryXml, type XmlAttribute, type XmlElement, type XmlValue } from './binary-xml';

const MANIFEST_ENTRY = 'AndroidManifest.xml';
const FINGERPRINT_ENTRY = 'assets/fingerprint';
const DEV_LAUNCHER = Buffer.from('Lexpo/modules/devlauncher/');
const NATIVE_LIBRARIES = ['libreactnative.so', 'libhermesvm.so', 'libc++_shared.so'] as const;

const ANDROID_NAME = 0x01010003;
const ANDROID_VALUE = 0x01010024;
const ANDROID_RESOURCE = 0x01010025;
const ANDROID_DEBUGGABLE = 0x0101000f;
const ANDROID_VERSION_CODE = 0x0101021b;
const ANDROID_VERSION_NAME = 0x0101021c;
const ANDROID_VERSION_CODE_MAJOR = 0x01010576;

export interface ApkFacts {
  readonly packageName: string;
  readonly versionCode: number;
  readonly versionName: string;
  readonly debuggable: boolean;
  readonly permissions: readonly string[];
  readonly metaData: Readonly<Record<string, string>>;
  readonly fingerprint: string | null;
  readonly includesDevLauncher: boolean;
  readonly abis: AndroidApkRelease['abis'];
  readonly signerSha256: string;
  readonly schemes: readonly ApkSignatureScheme[];
  readonly size: number;
  readonly sha256: string;
}

function manifestProblem(message: string): never {
  throw new ApkFactsError('manifest', `The AndroidManifest.xml ${message}.`);
}

function androidAttribute(element: XmlElement, id: number): XmlAttribute | undefined {
  const found = element.attributes.filter((attribute) => attribute.resourceId === id);
  if (found.length > 1) manifestProblem(`has a duplicate attribute on <${element.name}>`);
  return found[0];
}

function plainAttribute(element: XmlElement, name: string): XmlAttribute | undefined {
  const found = element.attributes.filter(
    (attribute) => attribute.namespace === null && attribute.name === name,
  );
  if (found.length > 1) manifestProblem(`has a duplicate ${name} on <${element.name}>`);
  return found[0];
}

function text(value: XmlValue | undefined, what: string): string {
  if (value?.kind !== 'string') manifestProblem(`has no literal ${what}`);
  return value.text;
}

function hex(value: number): string {
  return `0x${value.toString(16).padStart(8, '0')}`;
}

function shown(value: XmlValue): string {
  if (value.kind === 'string') return value.text;
  if (value.kind === 'boolean') return String(value.value);
  if (value.kind === 'integer') return hex(value.value);
  if (value.kind === 'reference') return `@${hex(value.id)}`;
  return `(type ${hex(value.type)})${hex(value.data)}`;
}

function childrenNamed(element: XmlElement, name: string): readonly XmlElement[] {
  return element.children.filter((child) => child.name === name);
}

function metaDataOf(application: XmlElement): Readonly<Record<string, string>> {
  const entries = new Map<string, string>();
  for (const item of childrenNamed(application, 'meta-data')) {
    const name = text(androidAttribute(item, ANDROID_NAME)?.value, 'meta-data name');
    const value =
      androidAttribute(item, ANDROID_VALUE)?.value ??
      androidAttribute(item, ANDROID_RESOURCE)?.value;
    if (value === undefined) manifestProblem(`meta-data ${name} has no value`);
    if (entries.has(name)) manifestProblem(`declares meta-data ${name} twice`);
    entries.set(name, shown(value));
  }
  return Object.fromEntries(entries);
}

type ManifestFacts = Pick<
  ApkFacts,
  'packageName' | 'versionCode' | 'versionName' | 'debuggable' | 'permissions' | 'metaData'
>;

function versionCodeOf(root: XmlElement): number {
  if (androidAttribute(root, ANDROID_VERSION_CODE_MAJOR) !== undefined)
    manifestProblem('sets versionCodeMajor, which the Hub does not support');
  const versionCode = androidAttribute(root, ANDROID_VERSION_CODE)?.value;
  if (versionCode?.kind !== 'integer' || versionCode.value <= 0)
    manifestProblem('has no literal positive versionCode');
  return versionCode.value;
}

function applicationOf(root: XmlElement): XmlElement {
  const applications = childrenNamed(root, 'application');
  const [application] = applications;
  if (application === undefined || applications.length !== 1)
    manifestProblem('must have exactly one <application>');
  return application;
}

function isDebuggable(application: XmlElement): boolean {
  const debuggable = androidAttribute(application, ANDROID_DEBUGGABLE)?.value;
  if (debuggable === undefined) return false;
  return debuggable.kind !== 'boolean' || debuggable.value;
}

export function manifestFacts(bytes: Buffer): ManifestFacts {
  const root = parseBinaryXml(bytes);
  if (root.name !== 'manifest') manifestProblem('does not start with <manifest>');
  const application = applicationOf(root);
  return {
    packageName: text(plainAttribute(root, 'package')?.value, 'package'),
    versionCode: versionCodeOf(root),
    versionName: text(androidAttribute(root, ANDROID_VERSION_NAME)?.value, 'versionName'),
    debuggable: isDebuggable(application),
    permissions: childrenNamed(root, 'uses-permission').map((permission) =>
      text(androidAttribute(permission, ANDROID_NAME)?.value, 'uses-permission name'),
    ),
    metaData: metaDataOf(application),
  };
}

function dataStart(zip: ZipFile, entry: Entry): Promise<number> {
  return new Promise((resolve, reject) => {
    zip.readLocalFileHeader(entry, { minimal: true }, (cause, header) => {
      if (cause === null) resolve(header.fileDataStart);
      else reject(new ZipReadError(cause));
    });
  });
}

async function containsNeedle(zip: ZipFile, entry: Entry, needle: Buffer): Promise<boolean> {
  let tail = Buffer.alloc(0);
  for await (const chunk of await openEntryStream(zip, entry)) {
    if (!Buffer.isBuffer(chunk)) throw new ZipReadError('a dex entry did not read as bytes');
    const window = Buffer.concat([tail, chunk]);
    if (window.includes(needle)) return true;
    tail = window.subarray(Math.max(0, window.length - needle.length + 1));
  }
  return false;
}

interface EntryFacts {
  readonly manifest: Buffer;
  readonly fingerprint: string | null;
  readonly includesDevLauncher: boolean;
  readonly names: ReadonlySet<string>;
}

async function entryFacts(path: string, entriesEnd: number): Promise<EntryFacts> {
  let zip: ZipFile;
  try {
    zip = await openZip(path);
  } catch (cause) {
    throw new ApkFactsError(
      'not_zip',
      `The APK cannot be read as a ZIP: ${cause instanceof Error ? cause.message : String(cause)}.`,
      { cause },
    );
  }
  try {
    const names = new Set<string>();
    const found: { manifest: Buffer | null } = { manifest: null };
    let fingerprint: string | null = null;
    let includesDevLauncher = false;
    await visitEntries(zip, async (entry): Promise<'next'> => {
      if (names.has(entry.fileName))
        throw new ApkFactsError('entries', `The APK lists ${entry.fileName} twice.`);
      names.add(entry.fileName);
      if ((await dataStart(zip, entry)) + entry.compressedSize > entriesEnd)
        throw new ApkFactsError(
          'entries',
          `The APK entry ${entry.fileName} is not inside the signed ZIP entries.`,
        );
      if (entry.fileName === MANIFEST_ENTRY) found.manifest = await readEntryBytes(zip, entry);
      else if (entry.fileName === FINGERPRINT_ENTRY) {
        const value = (await readEntryBytes(zip, entry)).toString('utf8').trim();
        fingerprint = value === '' ? null : value;
      } else if (
        /^classes\d*\.dex$/u.test(entry.fileName) &&
        !includesDevLauncher &&
        (await containsNeedle(zip, entry, DEV_LAUNCHER))
      )
        includesDevLauncher = true;
      return 'next';
    });
    if (zip.entryCount !== names.size)
      throw new ApkFactsError('entries', 'The APK entry count does not match its entries.');
    if (found.manifest === null)
      throw new ApkFactsError('manifest', 'The APK has no AndroidManifest.xml.');
    return { manifest: found.manifest, fingerprint, includesDevLauncher, names };
  } catch (cause) {
    if (cause instanceof ZipReadError)
      throw new ApkFactsError('not_zip', 'The APK ZIP entries cannot be read.');
    throw cause;
  } finally {
    closeZip(zip);
  }
}

async function sha256Of(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    if (!Buffer.isBuffer(chunk))
      throw new ApkFactsError('not_zip', 'The APK did not read as bytes.');
    hash.update(chunk);
  }
  return hash.digest('hex');
}

export async function readApkFacts(path: string): Promise<ApkFacts> {
  const signature = await verifyApkSignature(path);
  const entries = await entryFacts(path, signature.entriesEnd);
  return {
    ...manifestFacts(entries.manifest),
    fingerprint: entries.fingerprint,
    includesDevLauncher: entries.includesDevLauncher,
    abis: ANDROID_APK_ABIS.filter((abi) =>
      NATIVE_LIBRARIES.every((name) => entries.names.has(`lib/${abi}/${name}`)),
    ),
    signerSha256: signature.signerSha256,
    schemes: signature.schemes,
    size: signature.size,
    sha256: await sha256Of(path),
  };
}
