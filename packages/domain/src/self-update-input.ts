import { z } from 'zod';
import { APP_UPDATE_PLATFORMS } from './app-updates';
import { HUB_UPDATE_COMMIT } from './hub-update-source';
import { MACHINE_UPDATE_ARCHES } from './machine-updates';
import { RELEASE_NOTES } from './release-notes';
import {
  RELEASE_ARTIFACT,
  RELEASE_FINGERPRINT,
  RELEASE_KEY_LABEL,
  RELEASE_KEY_ROLE,
  RELEASE_PUBLIC_KEY,
  RELEASE_SOURCE,
  RELEASE_TAG,
  RELEASE_UPLOAD_ID,
  type ReleaseSource,
} from './release-sources';

const ID = z.uuid();

export const UPDATE_ACTIONS = [
  'status',
  'hub',
  'app',
  'ui',
  'desktop',
  'recover',
  'rollback',
  'keep',
  'release_keys',
  'discard',
] as const;

export type UpdateAction = (typeof UPDATE_ACTIONS)[number];

export const RELEASE_KEY_OPERATIONS = ['list', 'trust', 'remove', 'set', 'clear'] as const;

export type ReleaseKeyOperation = (typeof RELEASE_KEY_OPERATIONS)[number];

export const GITHUB_RELEASE_TOKEN = z.string().trim().min(1).max(1024).regex(/^\S+$/u);

const SOURCE_FIELDS = {
  source: RELEASE_SOURCE.optional().describe(
    'Where the build comes from: provided is a build staged by upload, github is a GitHub release, hub builds on the Hub machine and only works when that artifact’s source is set to hub; omit to use the configured source of the artifact',
  ),
  upload: RELEASE_UPLOAD_ID.optional().describe(
    'The staged upload ID of the provided build; required with source provided',
  ),
  tag: RELEASE_TAG.optional().describe(
    'The GitHub release tag to download; with source github give either tag or commit',
  ),
  commit: HUB_UPDATE_COMMIT.optional().describe(
    'The exact commit the build is for: the GitHub release of that commit with source github, or the commit the Hub builds with source hub (omit for the branch tip)',
  ),
};

interface SourceFields {
  readonly source?: ReleaseSource | undefined;
  readonly upload?: string | undefined;
  readonly tag?: string | undefined;
  readonly commit?: string | undefined;
}

const SOURCE_RULES: Readonly<Record<ReleaseSource, (input: SourceFields) => string | null>> = {
  provided: ({ upload, tag, commit }) => {
    if (upload === undefined) return 'source provided needs the staged upload ID';
    return tag === undefined && commit === undefined
      ? null
      : 'source provided takes only the upload ID';
  },
  github: ({ upload, tag, commit }) => {
    if (upload !== undefined) return 'source github does not take an upload ID';
    return (tag === undefined) === (commit === undefined)
      ? 'source github needs exactly one of tag or commit'
      : null;
  },
  hub: ({ upload, tag }) =>
    upload === undefined && tag === undefined ? null : 'source hub takes only an optional commit',
};

export function updateSourceProblem(input: SourceFields): string | null {
  if (input.source !== undefined) return SOURCE_RULES[input.source](input);
  const given = [input.upload, input.tag, input.commit].some((value) => value !== undefined);
  return given ? 'upload, tag and commit need an explicit source' : null;
}

function checkSource(input: SourceFields, context: z.RefinementCtx): void {
  const problem = updateSourceProblem(input);
  if (problem !== null) context.addIssue({ code: 'custom', path: ['source'], message: problem });
}

export const UPDATE_STATUS_INPUT = z.strictObject({
  action: z.literal('status'),
  id: ID.optional().describe(
    'The hub, app, ui or desktop run to check; omit for the latest hub release',
  ),
});

export const UPDATE_HUB_INPUT = z.strictObject({
  action: z.literal('hub'),
  notes: z.string().trim().min(1).max(500).describe('What the hub release changes, for the log'),
  ...SOURCE_FIELDS,
});

export const UPDATE_APP_INPUT = z.strictObject({
  action: z.literal('app'),
  runId: ID.describe('A unique request ID; reuse it to check an interrupted publication'),
  clientId: ID.optional().describe(
    'Limit publication to this paired Android device; omit to publish to all compatible devices',
  ),
  notes: RELEASE_NOTES.describe('What the app release changes, for the store'),
  channel: z
    .enum(['release', 'dev'])
    .default('release')
    .describe(
      'Use release for all current devices; dev is only for moving a specific older Test installation to the current feed',
    ),
  ...SOURCE_FIELDS,
});

export const UPDATE_UI_INPUT = z.strictObject({
  action: z.literal('ui'),
  runId: ID.describe('A unique request ID; reuse it to check an interrupted publication'),
  clientId: ID.optional().describe(
    'Limit the Android offer to this paired device; desktop UI still publishes to its compatible channel',
  ),
  platform: z
    .enum(APP_UPDATE_PLATFORMS)
    .optional()
    .describe(
      'Which UI export to download when the GitHub release holds one per platform; only with source github',
    ),
  notes: RELEASE_NOTES.describe('What the Android and desktop UI update changes'),
  channel: z
    .enum(['release', 'dev'])
    .default('release')
    .describe(
      'Use release for all current devices; dev is only for moving a specific older Test installation to the current feed',
    ),
  ...SOURCE_FIELDS,
});

export const UPDATE_DESKTOP_INPUT = z.strictObject({
  action: z.literal('desktop'),
  runId: ID.describe('A unique request ID; reuse it to check an interrupted release'),
  notes: RELEASE_NOTES.describe('What the desktop release changes'),
  arches: z
    .array(z.enum(MACHINE_UPDATE_ARCHES))
    .min(1)
    .refine((arches) => new Set(arches).size === arches.length, {
      message: 'each architecture may be listed once',
    })
    .describe(
      'Every Linux architecture to keep offering; the release replaces the previous one, so list x64 and arm64 together when both stay available',
    ),
  ...SOURCE_FIELDS,
});

export const UPDATE_RECOVER_INPUT = z.strictObject({
  action: z.literal('recover'),
  id: ID.describe('The hub update to recover, from action status'),
  holdSeconds: z
    .int()
    .min(0)
    .max(600)
    .default(120)
    .describe('How long the recovered watchdog keeps watching the release'),
});

export const UPDATE_ROLLBACK_INPUT = z.strictObject({
  action: z.literal('rollback'),
  artifact: RELEASE_ARTIFACT.describe('Which release to roll back'),
  id: ID.describe('The run to roll back, from action status; it must be waiting for a decision'),
});

export const UPDATE_KEEP_INPUT = z.strictObject({
  action: z.literal('keep'),
  id: ID.describe(
    'The hub update to keep as it is, from action status; it must be waiting for a decision',
  ),
});

export const UPDATE_RELEASE_KEYS_INPUT = z.strictObject({
  action: z.literal('release_keys'),
  operation: z
    .enum(RELEASE_KEY_OPERATIONS)
    .describe(
      'List, trust or remove a release signing key, or set or clear the GitHub release token',
    ),
  publicKey: RELEASE_PUBLIC_KEY.optional().describe(
    'The base64 raw Ed25519 public key to trust; only with trust',
  ),
  role: RELEASE_KEY_ROLE.optional().describe(
    'machine for a dev machine key, github for the GitHub release key; only with trust',
  ),
  label: RELEASE_KEY_LABEL.optional().describe('A name for the key; only with trust'),
  fingerprint: RELEASE_FINGERPRINT.optional().describe('The key to remove; only with remove'),
  token: GITHUB_RELEASE_TOKEN.optional().describe(
    'A GitHub token that can only read the repository’s releases, needed only for a private repository; only with set. It is stored encrypted and never shown again',
  ),
});

export const UPDATE_DISCARD_INPUT = z.strictObject({
  action: z.literal('discard'),
  upload: RELEASE_UPLOAD_ID.describe(
    'The staged upload ID to delete with every byte the Hub kept for it, still receiving or staged',
  ),
});

type ReleaseKeysFields = z.infer<typeof UPDATE_RELEASE_KEYS_INPUT>;

const KEY_FIELDS = ['publicKey', 'role', 'label', 'fingerprint', 'token'] as const;

const KEY_REQUIRED: Readonly<Record<ReleaseKeyOperation, readonly (typeof KEY_FIELDS)[number][]>> =
  {
    list: [],
    trust: ['publicKey', 'role', 'label'],
    remove: ['fingerprint'],
    set: ['token'],
    clear: [],
  };

export function releaseKeysProblem(input: ReleaseKeysFields): string | null {
  const required = KEY_REQUIRED[input.operation];
  const missing = required.find((field) => input[field] === undefined);
  if (missing !== undefined) return `${input.operation} needs ${missing}`;
  const extra = KEY_FIELDS.find((field) => !required.includes(field) && input[field] !== undefined);
  return extra === undefined ? null : `${input.operation} does not take ${extra}`;
}

export const UPDATE_INPUT = z
  .discriminatedUnion('action', [
    UPDATE_STATUS_INPUT,
    UPDATE_HUB_INPUT,
    UPDATE_APP_INPUT,
    UPDATE_UI_INPUT,
    UPDATE_DESKTOP_INPUT,
    UPDATE_RECOVER_INPUT,
    UPDATE_ROLLBACK_INPUT,
    UPDATE_KEEP_INPUT,
    UPDATE_RELEASE_KEYS_INPUT,
    UPDATE_DISCARD_INPUT,
  ])
  .superRefine((input, context) => {
    if (
      input.action === 'hub' ||
      input.action === 'app' ||
      input.action === 'ui' ||
      input.action === 'desktop'
    )
      checkSource(input, context);
    if (input.action === 'release_keys') {
      const problem = releaseKeysProblem(input);
      if (problem !== null)
        context.addIssue({ code: 'custom', path: ['operation'], message: problem });
    }
  });

export type UpdateInput = z.infer<typeof UPDATE_INPUT>;

export const APP_PUBLICATION_INPUT = z
  .discriminatedUnion('action', [UPDATE_APP_INPUT, UPDATE_UI_INPUT])
  .superRefine(checkSource);

export type AppPublicationInput = z.infer<typeof APP_PUBLICATION_INPUT>;

export type DesktopReleaseInput = z.infer<typeof UPDATE_DESKTOP_INPUT>;
