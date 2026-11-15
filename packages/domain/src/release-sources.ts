import { z } from 'zod';

export const RELEASE_SOURCES = ['provided', 'github', 'hub'] as const;

export type ReleaseSource = (typeof RELEASE_SOURCES)[number];

export const RELEASE_SOURCE = z.enum(RELEASE_SOURCES);

export const RELEASE_ARTIFACTS = ['hub', 'apk', 'ui', 'desktop'] as const;

export type ReleaseArtifact = (typeof RELEASE_ARTIFACTS)[number];

export const RELEASE_ARTIFACT = z.enum(RELEASE_ARTIFACTS);

export const RELEASE_KEY_ROLES = ['machine', 'github'] as const;

export type ReleaseKeyRole = (typeof RELEASE_KEY_ROLES)[number];

export const RELEASE_KEY_ROLE = z.enum(RELEASE_KEY_ROLES);

export const RELEASE_DEFAULT_SOURCE: ReleaseSource = 'provided';

export const RELEASE_FINGERPRINT = z.string().regex(/^[a-f0-9]{64}$/u);

export const RELEASE_PUBLIC_KEY = z.string().regex(/^[A-Za-z0-9+/]{43}=$/u);

export const RELEASE_KEY_LABEL = z.string().trim().min(1).max(80);

export const RELEASE_TAG = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u)
  .refine((tag) => !tag.includes('..') && !tag.endsWith('.lock') && !tag.endsWith('.'), {
    message: 'must be a plain release tag',
  });

export const RELEASE_UPLOAD_ID = z.uuid();
