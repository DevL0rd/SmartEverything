import { largestIcnsPng } from './icns';

const APPLE_DOUBLE_MAGIC = 0x00051607;

const RESOURCE_FORK = 2;

const ICON_TYPE = 'icns';

const ENTRY_BYTES = 12;

const HEADER_BYTES = 26;

function latin1(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1');
}

function resourceForkOf(bytes: Uint8Array): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < HEADER_BYTES || view.getUint32(0) !== APPLE_DOUBLE_MAGIC) return null;
  const count = view.getUint16(24);
  for (let index = 0; index < count; index += 1) {
    const at = HEADER_BYTES + index * ENTRY_BYTES;
    if (at + ENTRY_BYTES > bytes.length) return null;
    if (view.getUint32(at) === RESOURCE_FORK) {
      const offset = view.getUint32(at + 4);
      const length = view.getUint32(at + 8);
      return offset + length <= bytes.length ? bytes.subarray(offset, offset + length) : null;
    }
  }
  return null;
}

function iconResources(fork: Uint8Array): readonly Uint8Array[] {
  const view = new DataView(fork.buffer, fork.byteOffset, fork.byteLength);
  if (fork.length < 16) return [];
  const dataOffset = view.getUint32(0);
  const mapOffset = view.getUint32(4);
  if (mapOffset + 30 > fork.length) return [];
  const typeList = mapOffset + view.getUint16(mapOffset + 24);
  const types = view.getUint16(typeList) + 1;
  const found: Uint8Array[] = [];
  for (let index = 0; index < types; index += 1) {
    const at = typeList + 2 + index * 8;
    if (at + 8 > fork.length) break;
    if (latin1(fork.subarray(at, at + 4)) !== ICON_TYPE) continue;
    const references = view.getUint16(at + 4) + 1;
    const list = typeList + view.getUint16(at + 6);
    for (let reference = 0; reference < references; reference += 1) {
      const entry = list + reference * 12;
      if (entry + 12 > fork.length) break;
      const offset = dataOffset + (view.getUint32(entry + 4) & 0x00ffffff);
      if (offset + 4 > fork.length) continue;
      const length = view.getUint32(offset);
      if (offset + 4 + length <= fork.length)
        found.push(fork.subarray(offset + 4, offset + 4 + length));
    }
  }
  return found;
}

export function appleDoubleIconPng(bytes: Uint8Array): Uint8Array | null {
  const fork = resourceForkOf(bytes);
  if (fork === null) return null;
  let best: Uint8Array | null = null;
  for (const resource of iconResources(fork)) {
    const png = largestIcnsPng(resource);
    if (png !== null && (best === null || png.length > best.length)) best = png;
  }
  return best;
}
