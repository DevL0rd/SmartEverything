import { MODEL_SPEC, type ModelSpec } from '@smarteverything/domain';

const VIEW = { yaw: 30, pitch: 20, fov: 35, padding: 0.1 };

export function specOf(
  id = 'dev.fan.example',
  version = '1.0.0',
  extra: Record<string, unknown> = {},
): ModelSpec {
  return MODEL_SPEC.parse({
    schema: 1,
    id,
    version,
    title: 'Example fan',
    category: 'climate',
    footprint: { width: 0.2, depth: 0.2, height: 0.4 },
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    materials: { body: { color: '#cccccc' } },
    parts: [{ id: 'shell', geometry: { type: 'sphere', radius: 0.1 }, material: 'body' }],
    ...extra,
  });
}

export function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function text(value: string): number[] {
  return Array.from({ length: value.length }, (_, index) => value.charCodeAt(index));
}

function u32(value: number, little: boolean): number[] {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, little);
  return [...bytes];
}

export function pngBytes(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...u32(13, false),
    ...text('IHDR'),
    ...u32(width, false),
    ...u32(height, false),
    8,
    6,
    0,
    0,
    0,
  ]);
}

function riff(chunk: readonly number[]): number[] {
  return [...text('RIFF'), ...u32(chunk.length + 4, true), ...text('WEBP'), ...chunk];
}

export function webpExtendedBytes(width: number, height: number): Uint8Array {
  const w = width - 1;
  const h = height - 1;
  return Uint8Array.from(
    riff([
      ...text('VP8X'),
      ...u32(10, true),
      0,
      0,
      0,
      0,
      w & 0xff,
      (w >> 8) & 0xff,
      (w >> 16) & 0xff,
      h & 0xff,
      (h >> 8) & 0xff,
      (h >> 16) & 0xff,
    ]),
  );
}
