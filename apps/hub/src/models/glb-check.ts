import { z } from 'zod';

export const GLB_BYTE_LIMIT = 20 * 1024 * 1024;

export const GLB_JSON_BYTE_LIMIT = 4 * 1024 * 1024;

export const GLB_TRIANGLE_LIMIT = 200_000;

export const GLB_TEXTURE_LIMIT = 8;

export const GLB_TEXTURE_MAX_SIDE = 2048;

const MATERIAL_EXTENSIONS =
  'unlit emissive_strength clearcoat transmission volume ior specular sheen iridescence anisotropy dispersion';

export const GLB_EXTENSION_ALLOWLIST: ReadonlySet<string> = new Set([
  ...MATERIAL_EXTENSIONS.split(' ').map((name) => `KHR_materials_${name}`),
  'KHR_texture_transform',
  'KHR_mesh_quantization',
  'EXT_texture_webp',
]);

export interface GlbImageReport {
  readonly index: number;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
}

export interface GlbReport {
  readonly triangles: number;
  readonly images: readonly GlbImageReport[];
  readonly extensions: readonly string[];
  readonly binByteLength: number;
}

export type GlbCheck =
  | { readonly ok: true; readonly value: GlbReport }
  | { readonly ok: false; readonly problem: string };

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const UNSIGNED_INDEX_TYPES: readonly number[] = [5121, 5123, 5125];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const COMPONENT_TYPES: readonly number[] = [5120, 5121, 5122, 5123, 5125, 5126];
const COMPONENT_SIZES: readonly number[] = [1, 1, 2, 2, 4, 4];
const ACCESSOR_TYPES = ['SCALAR', 'VEC2', 'VEC3', 'VEC4', 'MAT2', 'MAT3', 'MAT4'] as const;

const DECODER = new TextDecoder('utf-8', { fatal: true });

const INDEX = z.number().int().nonnegative();
const COMPONENT = z
  .number()
  .int()
  .refine((v) => COMPONENT_TYPES.includes(v), 'unknown type');
const VIEW = z.looseObject({
  buffer: INDEX,
  byteOffset: INDEX.optional(),
  byteLength: z.number().int().positive(),
  byteStride: z.number().int().min(4).max(252).optional(),
});
const SPARSE = z.looseObject({
  count: z.number().int().positive(),
  indices: z.looseObject({
    bufferView: INDEX,
    byteOffset: INDEX.optional(),
    componentType: COMPONENT,
  }),
  values: z.looseObject({ bufferView: INDEX, byteOffset: INDEX.optional() }),
});
const ACCESSOR = z.looseObject({
  bufferView: INDEX.optional(),
  byteOffset: INDEX.optional(),
  componentType: COMPONENT,
  count: z.number().int().positive(),
  type: z.enum(ACCESSOR_TYPES),
  sparse: SPARSE.optional(),
});
const PRIMITIVE = z.looseObject({
  attributes: z.record(z.string(), INDEX),
  indices: INDEX.optional(),
  mode: z.number().int().min(0).max(6).optional(),
});
const BUFFER = z.looseObject({
  byteLength: z.number().int().positive(),
  uri: z.unknown().optional(),
});
const IMAGE = z.looseObject({
  bufferView: INDEX.optional(),
  mimeType: z.string().optional(),
  uri: z.unknown().optional(),
});
const NODE = z.looseObject({ mesh: INDEX.optional(), children: z.array(INDEX).optional() });
const DOCUMENT = z.looseObject({
  asset: z.looseObject({ version: z.string().startsWith('2.') }),
  buffers: z.array(BUFFER).default([]),
  bufferViews: z.array(VIEW).default([]),
  accessors: z.array(ACCESSOR).default([]),
  images: z.array(IMAGE).default([]),
  meshes: z.array(z.looseObject({ primitives: z.array(PRIMITIVE) })).default([]),
  nodes: z.array(NODE).default([]),
  extensionsUsed: z.array(z.string()).default([]),
  extensionsRequired: z.array(z.string()).default([]),
});

type Doc = z.infer<typeof DOCUMENT>;
type View = Doc['bufferViews'][number];
type Accessor = Doc['accessors'][number];
type Primitive = Doc['meshes'][number]['primitives'][number];

class GlbRejection extends Error {}

function reject(problem: string): never {
  throw new GlbRejection(problem);
}

function dataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function readChunks(bytes: Uint8Array): readonly (readonly [number, Uint8Array])[] {
  const view = dataView(bytes);
  const chunks: [number, Uint8Array][] = [];
  let at = HEADER_BYTES;
  while (at < bytes.byteLength) {
    if (at + CHUNK_HEADER_BYTES > bytes.byteLength) reject('ends inside a chunk header');
    const size = view.getUint32(at, true);
    const end = at + CHUNK_HEADER_BYTES + size;
    if (size % 4 !== 0) reject('has a chunk whose length is not a multiple of 4');
    if (end > bytes.byteLength) reject('has a chunk that runs past the end of the file');
    chunks.push([view.getUint32(at + 4, true), bytes.subarray(at + 8, end)]);
    at = end;
  }
  return chunks;
}

function checkHeader(bytes: Uint8Array): void {
  if (bytes.byteLength < HEADER_BYTES + CHUNK_HEADER_BYTES) reject('is too short to be a GLB');
  const view = dataView(bytes);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2) {
    reject('is not a GLB version 2 file');
  }
  if (view.getUint32(8, true) !== bytes.byteLength) {
    reject('declares a length that differs from the file size');
  }
}

function splitChunks(bytes: Uint8Array): { json: Uint8Array; bin: Uint8Array } {
  checkHeader(bytes);
  const [first, second, ...rest] = readChunks(bytes);
  if (first?.[0] !== CHUNK_JSON) reject('does not start with a JSON chunk');
  if (rest.length > 0 || (second !== undefined && second[0] !== CHUNK_BIN)) {
    reject('holds chunks other than one JSON chunk and one optional BIN chunk');
  }
  return { json: first[1], bin: second?.[1] ?? new Uint8Array() };
}

function parseJson(json: Uint8Array): unknown {
  if (json.byteLength > GLB_JSON_BYTE_LIMIT) {
    reject(`has a JSON chunk over the ${String(GLB_JSON_BYTE_LIMIT)} byte limit`);
  }
  try {
    return JSON.parse(DECODER.decode(json));
  } catch (cause) {
    return reject(
      `has a JSON chunk that is not UTF-8 JSON (${cause instanceof Error ? cause.name : 'rejected'})`,
    );
  }
}

function parseDocument(root: unknown): Doc {
  const parsed = DOCUMENT.safeParse(root);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const where = issue === undefined ? '' : issue.path.map(String).join('.');
  return reject(`has invalid glTF JSON (${where}: ${issue?.message ?? 'rejected'})`);
}

function entriesOf(value: object): readonly (readonly [string, unknown])[] {
  return Object.entries(value);
}

function checkExtensions(root: unknown, doc: Doc): readonly string[] {
  const names = new Set<string>([...doc.extensionsUsed, ...doc.extensionsRequired]);
  const pending: unknown[] = [root];
  for (let value = pending.pop(); value !== undefined; value = pending.pop()) {
    if (typeof value !== 'object' || value === null) continue;
    for (const [key, child] of entriesOf(value)) {
      if (key === 'extensions' && typeof child === 'object' && child !== null) {
        Object.keys(child).forEach((name) => names.add(name));
      }
      pending.push(child);
    }
  }
  for (const name of names) {
    if (!GLB_EXTENSION_ALLOWLIST.has(name)) reject(`uses extension ${name}, which is not allowed`);
  }
  return [...names].sort();
}

function checkBuffer(doc: Doc, bin: Uint8Array): void {
  if (doc.buffers.length > 1) reject('has more than the one embedded buffer');
  const buffer = doc.buffers[0];
  if (buffer?.uri !== undefined) reject('has a buffer with a uri; only the BIN chunk is allowed');
  const length = buffer?.byteLength ?? 0;
  if (length > bin.byteLength || (length > 0 && bin.byteLength - length > 3)) {
    reject('has a buffer length that does not match the BIN chunk');
  }
  doc.bufferViews.forEach((view, index) => {
    if (view.buffer !== 0 || (view.byteOffset ?? 0) + view.byteLength > length) {
      reject(`has bufferView ${String(index)} outside the embedded buffer`);
    }
  });
}

function viewAt(doc: Doc, index: number, label: string): View {
  return doc.bufferViews[index] ?? reject(`has ${label} pointing at a missing bufferView`);
}

function componentBytes(type: number): number {
  return COMPONENT_SIZES[COMPONENT_TYPES.indexOf(type)] ?? reject('has an unknown component type');
}

function elementBytes(accessor: Accessor): number {
  const component = componentBytes(accessor.componentType);
  const rows = accessor.type === 'SCALAR' ? 1 : Number(accessor.type.slice(-1));
  if (!accessor.type.startsWith('MAT')) return rows * component;
  return rows * Math.ceil((rows * component) / 4) * 4;
}

function checkDense(doc: Doc, accessor: Accessor, label: string, element: number): void {
  const component = componentBytes(accessor.componentType);
  const view = viewAt(doc, accessor.bufferView ?? 0, label);
  const stride = view.byteStride ?? element;
  const offset = accessor.byteOffset ?? 0;
  if (stride < element || stride % component !== 0) reject(`has ${label} with a bad byteStride`);
  if (((view.byteOffset ?? 0) + offset) % component !== 0)
    reject(`has ${label} that is misaligned`);
  if (offset + stride * (accessor.count - 1) + element > view.byteLength) {
    reject(`has ${label} that reads past its bufferView`);
  }
}

function checkSparse(doc: Doc, accessor: Accessor, label: string, element: number): void {
  const { sparse } = accessor;
  if (sparse === undefined) return;
  const { indices, values, count } = sparse;
  if (!UNSIGNED_INDEX_TYPES.includes(indices.componentType) || count > accessor.count) {
    reject(`has ${label} with invalid sparse data`);
  }
  const indexEnd = (indices.byteOffset ?? 0) + count * componentBytes(indices.componentType);
  const valueEnd = (values.byteOffset ?? 0) + count * element;
  if (
    indexEnd > viewAt(doc, indices.bufferView, label).byteLength ||
    valueEnd > viewAt(doc, values.bufferView, label).byteLength
  ) {
    reject(`has ${label} whose sparse data reads past its bufferView`);
  }
}

function checkAccessors(doc: Doc): void {
  doc.accessors.forEach((accessor, index) => {
    const label = `accessor ${String(index)}`;
    const element = elementBytes(accessor);
    if (accessor.bufferView !== undefined) checkDense(doc, accessor, label, element);
    else if (accessor.count * element > GLB_BYTE_LIMIT) {
      reject(`has ${label} that would allocate over ${String(GLB_BYTE_LIMIT)} bytes`);
    }
    checkSparse(doc, accessor, label, element);
  });
}

function accessorAt(doc: Doc, index: number): Accessor {
  return doc.accessors[index] ?? reject('has a primitive pointing at a missing accessor');
}

function vertexCount(doc: Doc, primitive: Primitive): number {
  Object.values(primitive.attributes).forEach((index) => accessorAt(doc, index));
  if (primitive.indices === undefined) {
    const position = primitive.attributes['POSITION'];
    return position === undefined ? 0 : accessorAt(doc, position).count;
  }
  const indices = accessorAt(doc, primitive.indices);
  if (indices.type !== 'SCALAR' || !UNSIGNED_INDEX_TYPES.includes(indices.componentType)) {
    reject('has a primitive whose indices are not unsigned scalars');
  }
  return indices.count;
}

function primitiveTriangles(doc: Doc, primitive: Primitive): number {
  const count = vertexCount(doc, primitive);
  const mode = primitive.mode ?? 4;
  if (mode === 4) return Math.floor(count / 3);
  return mode === 5 || mode === 6 ? Math.max(count - 2, 0) : 0;
}

function checkNodeForest(doc: Doc): void {
  const parents = new Array<number>(doc.nodes.length).fill(0);
  for (const child of doc.nodes.flatMap((node) => node.children ?? [])) {
    parents[child] = (parents[child] ?? reject('has a node pointing at a missing child')) + 1;
  }
  if (parents.some((count) => count > 1)) reject('has a node with more than one parent');
  const pending = parents.flatMap((count, index) => (count === 0 ? [index] : []));
  let visited = 0;
  for (let at = pending.pop(); at !== undefined; at = pending.pop()) {
    visited += 1;
    pending.push(...(doc.nodes[at]?.children ?? []));
  }
  if (visited !== doc.nodes.length) reject('has nodes that contain themselves');
}

function countTriangles(doc: Doc): number {
  const perMesh = doc.meshes.map((mesh) =>
    mesh.primitives.reduce((sum, primitive) => sum + primitiveTriangles(doc, primitive), 0),
  );
  checkNodeForest(doc);
  const meshTriangles = (mesh: number): number =>
    perMesh[mesh] ?? reject('has a node pointing at a missing mesh');
  const total = doc.nodes.reduce(
    (sum, { mesh }) => sum + (mesh === undefined ? 0 : meshTriangles(mesh)),
    0,
  );
  if (total > GLB_TRIANGLE_LIMIT) {
    reject(`has ${String(total)} triangles, over the ${String(GLB_TRIANGLE_LIMIT)} limit`);
  }
  return total;
}

type Size = readonly [width: number, height: number];

const NO_SIZE: Size = [0, 0];

function ascii(bytes: Uint8Array, at: number, text: string): boolean {
  return Array.from(text).every((char, index) => bytes[at + index] === char.charCodeAt(0));
}

function jpegSize(bytes: Uint8Array): Size {
  const view = dataView(bytes);
  let at = 2;
  while (at + 9 <= bytes.length) {
    const marker = view.getUint8(at + 1);
    const length = view.getUint16(at + 2);
    if (view.getUint8(at) !== 0xff || length < 2) return NO_SIZE;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return [view.getUint16(at + 7), view.getUint16(at + 5)];
    }
    at += 2 + length;
  }
  return NO_SIZE;
}

function webpSize(bytes: Uint8Array): Size {
  if (bytes.length < 30) return NO_SIZE;
  const view = dataView(bytes);
  if (ascii(bytes, 12, 'VP8 ')) {
    const sync = view.getUint16(23) === 0x9d01 && view.getUint8(25) === 0x2a;
    const side = (at: number): number => view.getUint16(at, true) & 0x3fff;
    return sync ? [side(26), side(28)] : NO_SIZE;
  }
  if (ascii(bytes, 12, 'VP8L')) {
    const bits = view.getUint32(21, true);
    return bytes[20] === 0x2f ? [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1] : NO_SIZE;
  }
  const read = (at: number): number => view.getUint16(at, true) + (view.getUint8(at + 2) << 16);
  return ascii(bytes, 12, 'VP8X') ? [read(24) + 1, read(27) + 1] : NO_SIZE;
}

function pngSize(bytes: Uint8Array): Size {
  const view = dataView(bytes);
  return bytes.length >= 24 && ascii(bytes, 12, 'IHDR')
    ? [view.getUint32(16), view.getUint32(20)]
    : NO_SIZE;
}

function imageOf(bytes: Uint8Array): { readonly mime: string; readonly size: Size } | null {
  if (PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    return { mime: 'image/png', size: pngSize(bytes) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', size: jpegSize(bytes) };
  }
  if (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP')) {
    return { mime: 'image/webp', size: webpSize(bytes) };
  }
  return null;
}

function imageBytes(doc: Doc, bin: Uint8Array, index: number): Uint8Array {
  const label = `image ${String(index)}`;
  const image = doc.images[index] ?? reject(`has ${label} that is missing`);
  if (image.uri !== undefined) reject(`has ${label} with a uri; only bufferView images fit`);
  const view = viewAt(doc, image.bufferView ?? -1, label);
  const start = view.byteOffset ?? 0;
  return bin.subarray(start, start + view.byteLength);
}

function checkImage(doc: Doc, bin: Uint8Array, index: number): GlbImageReport {
  const label = `image ${String(index)}`;
  const bytes = imageBytes(doc, bin, index);
  const mimeType = doc.images[index]?.mimeType;
  const found = imageOf(bytes);
  if (found === null || found.mime !== mimeType) {
    reject(`has ${label} whose bytes are not the PNG, JPEG or WebP it declares`);
  }
  const [width, height] = found.size;
  if (width < 1 || height < 1) reject(`has ${label} with no readable size`);
  const side = GLB_TEXTURE_MAX_SIDE;
  if (width > side || height > side) {
    reject(
      `has ${label} at ${String(width)} x ${String(height)}, over ${String(side)} x ${String(side)}`,
    );
  }
  return { index, mimeType: found.mime, width, height, byteLength: bytes.byteLength };
}

function inspect(content: Uint8Array): GlbReport {
  if (content.byteLength > GLB_BYTE_LIMIT) {
    reject(`is ${String(content.byteLength)} bytes, over the ${String(GLB_BYTE_LIMIT)} byte limit`);
  }
  const { json, bin } = splitChunks(content);
  const root = parseJson(json);
  const doc = parseDocument(root);
  const extensions = checkExtensions(root, doc);
  checkBuffer(doc, bin);
  checkAccessors(doc);
  if (doc.images.length > GLB_TEXTURE_LIMIT) reject(`has over ${String(GLB_TEXTURE_LIMIT)} images`);
  const images = doc.images.map((_, index) => checkImage(doc, bin, index));
  const triangles = countTriangles(doc);
  return { triangles, images, extensions, binByteLength: bin.byteLength };
}

export function checkGlb(content: Uint8Array): GlbCheck {
  try {
    return { ok: true, value: inspect(content) };
  } catch (cause) {
    if (cause instanceof GlbRejection) return { ok: false, problem: cause.message };
    throw cause;
  }
}
