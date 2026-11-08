import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { declaredVersion, HUB_MANIFEST } from './contract-helpers';
import { installedVersion } from './versions';

const SMALL =
  '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';

const require = createRequire(import.meta.url);

interface HeifImage {
  readonly get_width: () => number;
  readonly get_height: () => number;
  readonly is_primary: () => boolean;
}

const IMAGE = z.custom<HeifImage>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    'get_width' in value &&
    'get_height' in value &&
    'is_primary' in value,
);

const MODULE = z.object({
  HeifDecoder: z.custom<new () => { readonly decode: (bytes: Uint8Array) => unknown }>(
    (value) => typeof value === 'function',
  ),
});

function decode(bytes: Uint8Array): readonly HeifImage[] {
  const { HeifDecoder } = MODULE.parse(require('libheif-js/wasm-bundle'));
  return z.array(IMAGE).parse(new HeifDecoder().decode(bytes));
}

describe('libheif-js contract', () => {
  it('is declared at the installed version by the hub', () => {
    expect(declaredVersion(HUB_MANIFEST, 'libheif-js')).toBe(installedVersion('libheif-js'));
  });

  it('reads the primary image of a HEIC file with the rotation applied to its size', () => {
    const images = decode(new Uint8Array(Buffer.from(SMALL, 'base64')));
    const primary = images.find((image) => image.is_primary());

    expect(images).toHaveLength(1);
    expect(primary?.get_width()).toBe(64);
    expect(primary?.get_height()).toBe(96);
  });

  it('returns no images for bytes that are not HEIF', () => {
    expect(decode(new Uint8Array(Buffer.from('not a heif file')))).toEqual([]);
  });
});
