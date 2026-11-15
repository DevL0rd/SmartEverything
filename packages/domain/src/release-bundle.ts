import { z } from 'zod';
import { APP_UPDATE_PLATFORMS, ANDROID_APP_BUILD } from './app-updates';
import { HUB_UPDATE_COMMIT } from './hub-update-source';
import { MACHINE_UPDATE_ARCHES } from './machine-updates';
import { RELEASE_NOTES } from './release-notes';
import { RELEASE_FINGERPRINT } from './release-sources';

export const RELEASE_MANIFEST_FILE = 'release.json';

export const RELEASE_SIGNATURE_FILE = 'release.sig';

export const RELEASE_FILES_DIRECTORY = 'files';

export const RELEASE_SIGNATURE_ALGORITHM = 'ed25519';

const SHA256 = z.string().regex(/^[a-f0-9]{64}$/u);

function plainCode(code: number): boolean {
  return code > 0x1f && code !== 0x7f && code !== 0x5c;
}

function plainSegment(segment: string): boolean {
  if (segment === '' || segment === '.' || segment === '..') return false;
  for (let index = 0; index < segment.length; index += 1)
    if (!plainCode(segment.charCodeAt(index))) return false;
  return true;
}

function plainPath(path: string): boolean {
  return path.length > 0 && path.length <= 512 && path.split('/').every(plainSegment);
}

export const RELEASE_FILE_PATH = z.string().refine(plainPath, {
  message: 'must be a relative path without empty, dot or dot-dot parts',
});

export const RELEASE_FILE = z.strictObject({
  path: RELEASE_FILE_PATH,
  size: z.int().nonnegative(),
  sha256: SHA256,
  executable: z.boolean(),
});

export type ReleaseFile = z.infer<typeof RELEASE_FILE>;

export const RELEASE_GATE = z.strictObject({
  typeCheck: z.literal('passed'),
  commit: HUB_UPDATE_COMMIT,
});

export type ReleaseGate = z.infer<typeof RELEASE_GATE>;

export const RELEASE_LINUX_TARGETS = ['linux-x64', 'linux-arm64'] as const;

export type ReleaseLinuxTarget = (typeof RELEASE_LINUX_TARGETS)[number];

const VERSION = z.string().min(1).max(64);

const COMMON = {
  version: VERSION,
  commit: HUB_UPDATE_COMMIT,
  notes: RELEASE_NOTES,
  files: z.array(RELEASE_FILE).min(1),
  gate: RELEASE_GATE,
};

const SIGNER_SHA256 = z.string().regex(/^[A-F0-9]{2}(?::[A-F0-9]{2}){31}$|^[a-f0-9]{64}$/u);

export const RELEASE_HUB_FACTS = z.strictObject({
  schemaMin: z.int().nonnegative(),
  schemaMax: z.int().nonnegative(),
  nodeVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
});

export const RELEASE_APK_FACTS = z.strictObject({
  applicationId: ANDROID_APP_BUILD.shape.applicationId,
  versionCode: ANDROID_APP_BUILD.shape.versionCode,
  signerSha256: SIGNER_SHA256,
});

export const RELEASE_UI_FACTS = z.strictObject({ runtimeVersion: z.string().min(1).max(64) });

export const RELEASE_DESKTOP_FACTS = z.strictObject({
  version: VERSION,
  arches: z
    .array(z.enum(MACHINE_UPDATE_ARCHES))
    .min(1)
    .refine((arches) => new Set(arches).size === arches.length, {
      message: 'each architecture may be listed once',
    }),
});

export const RELEASE_MANIFEST = z
  .discriminatedUnion('artifact', [
    z.strictObject({
      artifact: z.literal('hub'),
      target: z.enum(RELEASE_LINUX_TARGETS),
      facts: RELEASE_HUB_FACTS,
      ...COMMON,
    }),
    z.strictObject({
      artifact: z.literal('apk'),
      target: z.literal('android'),
      facts: RELEASE_APK_FACTS,
      ...COMMON,
    }),
    z.strictObject({
      artifact: z.literal('ui'),
      target: z.enum(APP_UPDATE_PLATFORMS),
      facts: RELEASE_UI_FACTS,
      ...COMMON,
    }),
    z.strictObject({
      artifact: z.literal('desktop'),
      target: z.enum(RELEASE_LINUX_TARGETS),
      facts: RELEASE_DESKTOP_FACTS,
      ...COMMON,
    }),
  ])
  .superRefine((manifest, context) => {
    if (manifest.gate.commit !== manifest.commit)
      context.addIssue({
        code: 'custom',
        path: ['gate', 'commit'],
        message: 'the type check must have passed for the release commit',
      });
    const seen = new Set<string>();
    for (const [index, file] of manifest.files.entries()) {
      if (seen.has(file.path))
        context.addIssue({
          code: 'custom',
          path: ['files', index, 'path'],
          message: 'each file may be listed once',
        });
      seen.add(file.path);
    }
    if (manifest.artifact === 'hub' && manifest.facts.schemaMin > manifest.facts.schemaMax)
      context.addIssue({
        code: 'custom',
        path: ['facts', 'schemaMin'],
        message: 'the schema range must not be empty',
      });
  });

export type ReleaseManifest = z.infer<typeof RELEASE_MANIFEST>;

export const RELEASE_SIGNATURE = z.strictObject({
  algorithm: z.literal(RELEASE_SIGNATURE_ALGORITHM),
  fingerprint: RELEASE_FINGERPRINT,
  signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/u),
});

export type ReleaseSignature = z.infer<typeof RELEASE_SIGNATURE>;
