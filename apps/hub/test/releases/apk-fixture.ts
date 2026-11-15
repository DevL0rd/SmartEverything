import { createHash, createPrivateKey, sign, X509Certificate, type KeyObject } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { generate } from 'selfsigned';

export const ANDROID_NS = 'http://schemas.android.com/apk/res/android';

const RES = {
  name: 0x01010003,
  value: 0x01010024,
  debuggable: 0x0101000f,
  versionCode: 0x0101021b,
  versionName: 0x0101021c,
} as const;

type Value =
  | { readonly string: string }
  | { readonly int: number }
  | { readonly bool: boolean }
  | { readonly ref: number };

interface Attribute {
  readonly android: boolean;
  readonly name: string;
  readonly value: Value;
}

interface Node {
  readonly name: string;
  readonly attributes: readonly Attribute[];
  readonly children: readonly Node[];
}

const RESOURCE_IDS: Readonly<Record<string, number>> = RES;

function u16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function chunk(type: number, headerSize: number, header: Buffer, body: Buffer): Buffer {
  return Buffer.concat([
    u16(type),
    u16(headerSize),
    u32(8 + header.length + body.length),
    header,
    body,
  ]);
}

function stringsOf(root: Node): { readonly strings: string[]; readonly resourceNames: string[] } {
  const resourceNames: string[] = [];
  const others: string[] = [];
  const visit = (node: Node): void => {
    for (const attribute of node.attributes) {
      if (attribute.android) {
        if (!resourceNames.includes(attribute.name)) resourceNames.push(attribute.name);
      } else others.push(attribute.name);
      if ('string' in attribute.value) others.push(attribute.value.string);
    }
    others.push(node.name);
    node.children.forEach(visit);
  };
  visit(root);
  others.push(ANDROID_NS, 'android');
  const rest = new Set(others.filter((value) => !resourceNames.includes(value)));
  return { strings: [...resourceNames, ...rest], resourceNames };
}

function poolChunk(strings: readonly string[]): Buffer {
  const encoded = strings.map((value) =>
    Buffer.concat([u16(value.length), Buffer.from(value, 'utf16le'), u16(0)]),
  );
  const offsets: Buffer[] = [];
  let offset = 0;
  for (const item of encoded) {
    offsets.push(u32(offset));
    offset += item.length;
  }
  const stringData = Buffer.concat(encoded);
  const padded = Buffer.concat([stringData, Buffer.alloc((4 - (stringData.length % 4)) % 4)]);
  const header = Buffer.concat([
    u32(strings.length),
    u32(0),
    u32(0),
    u32(28 + strings.length * 4),
    u32(0),
  ]);
  return chunk(0x0001, 28, header, Buffer.concat([...offsets, padded]));
}

function attributeBytes(attribute: Attribute, index: (value: string) => number): Buffer {
  const { value } = attribute;
  const [raw, type, data] =
    'string' in value
      ? [index(value.string), 0x03, index(value.string)]
      : 'int' in value
        ? [0xffffffff, 0x10, value.int]
        : 'bool' in value
          ? [0xffffffff, 0x12, value.bool ? 0xffffffff : 0]
          : [0xffffffff, 0x01, value.ref];
  return Buffer.concat([
    u32(attribute.android ? index(ANDROID_NS) : 0xffffffff),
    u32(index(attribute.name)),
    u32(raw),
    u16(8),
    Buffer.from([0, type]),
    u32(data),
  ]);
}

const LINE = Buffer.concat([u32(1), u32(0xffffffff)]);

function elementChunks(node: Node, index: (value: string) => number): readonly Buffer[] {
  const attributes = node.attributes.map((attribute) => attributeBytes(attribute, index));
  const extension = Buffer.concat([
    u32(0xffffffff),
    u32(index(node.name)),
    u16(20),
    u16(20),
    u16(attributes.length),
    u16(0),
    u16(0),
    u16(0),
  ]);
  return [
    chunk(0x0102, 16, LINE, Buffer.concat([extension, ...attributes])),
    ...node.children.flatMap((child) => elementChunks(child, index)),
    chunk(0x0103, 16, LINE, Buffer.concat([u32(0xffffffff), u32(index(node.name))])),
  ];
}

function encodeXml(root: Node): Buffer {
  const { strings, resourceNames } = stringsOf(root);
  const index = (value: string): number => strings.indexOf(value);
  const map = chunk(
    0x0180,
    8,
    Buffer.alloc(0),
    Buffer.concat(resourceNames.map((name) => u32(RESOURCE_IDS[name] ?? 0))),
  );
  const namespace = Buffer.concat([LINE, u32(index('android')), u32(index(ANDROID_NS))]);
  const body = Buffer.concat([
    poolChunk(strings),
    map,
    chunk(0x0100, 16, Buffer.alloc(0), namespace),
    ...elementChunks(root, index),
    chunk(0x0101, 16, Buffer.alloc(0), namespace),
  ]);
  return Buffer.concat([u16(0x0003), u16(8), u32(8 + body.length), body]);
}

export interface ManifestSpec {
  readonly packageName: string;
  readonly versionCode: number;
  readonly versionName: string;
  readonly debuggable?: boolean;
  readonly metaData: Readonly<Record<string, string>>;
  readonly permissions?: readonly string[];
}

export function manifestXml(spec: ManifestSpec): Buffer {
  const android = (name: string, value: Value): Attribute => ({ android: true, name, value });
  return encodeXml({
    name: 'manifest',
    attributes: [
      android('versionCode', { int: spec.versionCode }),
      android('versionName', { string: spec.versionName }),
      { android: false, name: 'package', value: { string: spec.packageName } },
    ],
    children: [
      ...(spec.permissions ?? []).map((permission) => ({
        name: 'uses-permission',
        attributes: [android('name', { string: permission })],
        children: [],
      })),
      {
        name: 'application',
        attributes: spec.debuggable === true ? [android('debuggable', { bool: true })] : [],
        children: Object.entries(spec.metaData).map(([name, value]) => ({
          name: 'meta-data',
          attributes: [android('name', { string: name }), android('value', { string: value })],
          children: [],
        })),
      },
    ],
  });
}

interface ZipParts {
  readonly entries: Buffer;
  readonly central: Buffer;
  readonly count: number;
}

function zipParts(files: Readonly<Record<string, Buffer>>): ZipParts {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [path, data] of Object.entries(files)) {
    const name = Buffer.from(path);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  return {
    entries: Buffer.concat(locals),
    central: Buffer.concat(centrals),
    count: Object.keys(files).length,
  };
}

function endRecord(count: number, centralSize: number, centralStart: number): Buffer {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(0x06054b50, 0);
  record.writeUInt16LE(count, 8);
  record.writeUInt16LE(count, 10);
  record.writeUInt32LE(centralSize, 12);
  record.writeUInt32LE(centralStart, 16);
  return record;
}

function contentDigest(sections: readonly Buffer[]): Buffer {
  const digests: Buffer[] = [];
  for (const section of sections)
    for (let at = 0; at < section.length; at += 1024 * 1024) {
      const piece = section.subarray(at, Math.min(section.length, at + 1024 * 1024));
      digests.push(
        createHash('sha256')
          .update(Buffer.from([0xa5]))
          .update(u32(piece.length))
          .update(piece)
          .digest(),
      );
    }
  return createHash('sha256')
    .update(Buffer.from([0x5a]))
    .update(u32(digests.length))
    .update(Buffer.concat(digests))
    .digest();
}

function prefixed(...parts: readonly Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  return Buffer.concat([u32(body.length), body]);
}

export interface ApkSigner {
  readonly certificate: Buffer;
  readonly privateKey: KeyObject;
  readonly publicKey: Buffer;
  readonly sha256: string;
}

export async function apkSigner(name: string): Promise<ApkSigner> {
  const pair = await generate([{ name: 'commonName', value: name }], { algorithm: 'sha256' });
  const certificate = new X509Certificate(pair.cert);
  return {
    certificate: certificate.raw,
    privateKey: createPrivateKey(pair.private),
    publicKey: certificate.publicKey.export({ type: 'spki', format: 'der' }),
    sha256: createHash('sha256').update(certificate.raw).digest('hex'),
  };
}

const RSA_PKCS1_SHA256 = 0x0103;

function signerRecord(signer: ApkSigner, digest: Buffer, v3: boolean): Buffer {
  const sdk = v3 ? Buffer.concat([u32(24), u32(0x7fffffff)]) : Buffer.alloc(0);
  const signedData = Buffer.concat([
    prefixed(prefixed(u32(RSA_PKCS1_SHA256), prefixed(digest))),
    prefixed(prefixed(signer.certificate)),
    sdk,
    prefixed(),
  ]);
  const signature = sign('sha256', signedData, signer.privateKey);
  return prefixed(
    prefixed(signedData),
    sdk,
    prefixed(prefixed(u32(RSA_PKCS1_SHA256), prefixed(signature))),
    prefixed(signer.publicKey),
  );
}

function pair(id: number, value: Buffer): Buffer {
  const length = Buffer.alloc(8);
  length.writeBigUInt64LE(BigInt(value.length + 4));
  return Buffer.concat([length, u32(id), value]);
}

export interface ApkOptions {
  readonly signer: ApkSigner;
  readonly files: Readonly<Record<string, Buffer>>;
  readonly v3?: boolean;
  readonly v3Signer?: ApkSigner;
}

export function signedApk(options: ApkOptions): Buffer {
  const parts = zipParts(options.files);
  const digest = contentDigest([
    parts.entries,
    parts.central,
    endRecord(parts.count, parts.central.length, parts.entries.length),
  ]);
  const pairs = [pair(0x7109871a, prefixed(signerRecord(options.signer, digest, false)))];
  if (options.v3 === true)
    pairs.push(
      pair(0xf05368c0, prefixed(signerRecord(options.v3Signer ?? options.signer, digest, true))),
    );
  const body = Buffer.concat(pairs);
  const size = Buffer.alloc(8);
  size.writeBigUInt64LE(BigInt(body.length + 24));
  const block = Buffer.concat([size, body, size, Buffer.from('APK Sig Block 42', 'latin1')]);
  return Buffer.concat([
    parts.entries,
    block,
    parts.central,
    endRecord(parts.count, parts.central.length, parts.entries.length + block.length),
  ]);
}

export const SERVER = 'https://hub.example.test';

export const APP_ID = 'com.example.app';

export function appFiles(spec: Partial<ManifestSpec> = {}): Record<string, Buffer> {
  const libraries = Object.fromEntries(
    ['arm64-v8a', 'x86_64'].flatMap((abi) =>
      ['libreactnative.so', 'libhermesvm.so', 'libc++_shared.so'].map((name) => [
        `lib/${abi}/${name}`,
        Buffer.from(`${abi}/${name}`),
      ]),
    ),
  );
  return {
    'AndroidManifest.xml': manifestXml({
      packageName: APP_ID,
      versionCode: 200,
      versionName: '1.4.0',
      metaData: {
        'expo.modules.updates.EXPO_UPDATE_URL': `${SERVER}/api/app-update/manifest`,
        'expo.modules.updates.EXPO_RUNTIME_VERSION': 'file:fingerprint',
        'expo.modules.updates.CODE_SIGNING_CERTIFICATE': 'certificate',
      },
      ...spec,
    }),
    'assets/fingerprint': Buffer.from('runtime-abc\n'),
    'classes.dex': Buffer.from('dex\n035\0 main class'),
    ...libraries,
  };
}
