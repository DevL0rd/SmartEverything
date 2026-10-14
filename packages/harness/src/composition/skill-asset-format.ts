import { z } from 'zod';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { HarnessSkillAsset } from '@smarteverything/domain';
import { HarnessRuntimeError } from '../host/errors';

export const MAX_SKILL_ASSET_BYTES = 8 * 1024 * 1024;
export const MAX_SKILL_ASSET_FILES = 256;
const MAX_ENCODED_FILE_BYTES = 2 * 1024 * 1024;
const RELATIVE_PATH = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (value) =>
      !value.includes('\\') &&
      !value.includes('\0') &&
      !value.includes(':') &&
      value.split('/').length <= 16 &&
      value.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
  );
export const HARNESS_SKILL_ASSET_BUNDLE = z
  .strictObject({
    files: z
      .array(
        z.strictObject({
          path: RELATIVE_PATH,
          base64: z
            .string()
            .max(MAX_ENCODED_FILE_BYTES)
            .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
        }),
      )
      .min(1)
      .max(MAX_SKILL_ASSET_FILES),
  })
  .refine(
    (bundle) =>
      new Set(bundle.files.map((file) => file.path.toLowerCase())).size === bundle.files.length,
    'Skill file paths must be unique.',
  );
export type HarnessSkillAssetBundle = z.infer<typeof HARNESS_SKILL_ASSET_BUNDLE>;

export function decodeSkillAsset(
  asset: HarnessSkillAsset,
  bytes: Uint8Array,
): HarnessSkillAssetBundle {
  if (bytes.byteLength > MAX_SKILL_ASSET_BYTES)
    throw new HarnessRuntimeError(
      'operation_failed',
      'Skill asset exceeds the bounded byte limit.',
    );
  verifySkillAssetIntegrity(asset, bytes);
  const bundle = HARNESS_SKILL_ASSET_BUNDLE.parse(
    JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes)),
  );
  if (!bundle.files.some((file) => file.path === asset.entrypoint && file.path.endsWith('.md')))
    throw new HarnessRuntimeError(
      'operation_failed',
      'Skill asset entrypoint must name an included Markdown file.',
    );
  return bundle;
}

export function verifySkillAssetIntegrity(asset: HarnessSkillAsset, bytes: Uint8Array): void {
  const separator = asset.integrity.indexOf('-');
  const algorithm = asset.integrity.slice(0, separator);
  const expected = Buffer.from(asset.integrity.slice(separator + 1), 'base64');
  const actual = createHash(algorithm).update(bytes).digest();
  if (expected.byteLength !== actual.byteLength || !timingSafeEqual(expected, actual))
    throw new HarnessRuntimeError(
      'composition_incompatible',
      `Skill asset ${asset.id}@${asset.version} integrity differs from the desired artifact.`,
    );
}
