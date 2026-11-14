import { z } from 'zod';
import { ANDROID_APP_BUILD } from './app-updates';
import { HUB_UPDATE_COMMIT } from './hub-update-source';
import { MACHINE_UPDATE_ARCHES, MACHINE_UPDATE_MANIFEST } from './machine-updates';
import { RELEASE_NOTES } from './release-notes';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });
const PATH = z.string().refine((path) => path.startsWith('/') && !path.includes('..'), {
  message: 'must be an absolute path',
});

export const UPDATE_ACTIONS = ['status', 'hub', 'app', 'ui', 'desktop', 'recover'] as const;

export type UpdateAction = (typeof UPDATE_ACTIONS)[number];

export const UPDATE_INPUT = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('status'),
    id: ID.optional().describe(
      'The hub, app, ui or desktop run to check; omit for the latest hub release',
    ),
  }),
  z.strictObject({
    action: z.literal('hub'),
    notes: z.string().trim().min(1).max(500).describe('What the hub release changes, for the log'),
  }),
  z.strictObject({
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
  }),
  z.strictObject({
    action: z.literal('ui'),
    runId: ID.describe('A unique request ID; reuse it to check an interrupted publication'),
    clientId: ID.optional().describe(
      'Limit the Android offer to this paired device; desktop UI still publishes to its compatible channel',
    ),
    notes: RELEASE_NOTES.describe('What the Android and desktop UI update changes'),
    channel: z
      .enum(['release', 'dev'])
      .default('release')
      .describe(
        'Use release for all current devices; dev is only for moving a specific older Test installation to the current feed',
      ),
  }),
  z.strictObject({
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
  }),
  z.strictObject({
    action: z.literal('recover'),
    id: ID.describe('The hub update to recover, from action status'),
    holdSeconds: z
      .int()
      .min(0)
      .max(600)
      .default(120)
      .describe('How long the recovered watchdog stands ready to undo the release if the hub dies'),
  }),
]);

export type UpdateInput = z.infer<typeof UPDATE_INPUT>;

export const UPDATE_STATUS_INPUT = UPDATE_INPUT.options[0];
export const UPDATE_HUB_INPUT = UPDATE_INPUT.options[1];
export const UPDATE_APP_INPUT = UPDATE_INPUT.options[2];
export const UPDATE_UI_INPUT = UPDATE_INPUT.options[3];
export const UPDATE_DESKTOP_INPUT = UPDATE_INPUT.options[4];
export const UPDATE_RECOVER_INPUT = UPDATE_INPUT.options[5];

export const APP_PUBLICATION_INPUT = z.discriminatedUnion('action', [
  UPDATE_APP_INPUT,
  UPDATE_UI_INPUT,
]);

export type AppPublicationInput = z.infer<typeof APP_PUBLICATION_INPUT>;

export const APP_PUBLICATION = z.strictObject({
  id: ID,
  clientId: ID.nullable(),
  applicationId: ANDROID_APP_BUILD.shape.applicationId,
  versionCode: ANDROID_APP_BUILD.shape.versionCode.nullable(),
  runtimeVersion: z.string().min(1),
  desktop: z.strictObject({ id: ID, runtimeVersion: z.string().min(1) }).nullable(),
});

export type AppPublication = z.infer<typeof APP_PUBLICATION>;

const APP_PUBLICATION_END = {
  runId: ID,
  reason: z.string().min(1),
};

export const APP_PUBLICATION_RESULT = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('published'), runId: ID, publication: APP_PUBLICATION }),
  z.strictObject({ status: z.literal('partial'), runId: ID, publication: APP_PUBLICATION }),
  z.strictObject({ status: z.literal('refused'), ...APP_PUBLICATION_END }),
  z.strictObject({ status: z.literal('failed'), ...APP_PUBLICATION_END }),
]);

export type AppPublicationResult = z.infer<typeof APP_PUBLICATION_RESULT>;

export const APP_PUBLICATION_STATUS = z.strictObject({
  publication: APP_PUBLICATION_RESULT.nullable(),
});

export type DesktopReleaseInput = z.infer<typeof UPDATE_DESKTOP_INPUT>;

export const DESKTOP_RELEASE = z.strictObject({
  commit: HUB_UPDATE_COMMIT,
  manifest: MACHINE_UPDATE_MANIFEST,
});

export type DesktopRelease = z.infer<typeof DESKTOP_RELEASE>;

export const DESKTOP_RELEASE_RESULT = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('published'), runId: ID, release: DESKTOP_RELEASE }),
  z.strictObject({ status: z.literal('refused'), ...APP_PUBLICATION_END }),
  z.strictObject({ status: z.literal('failed'), ...APP_PUBLICATION_END }),
]);

export type DesktopReleaseResult = z.infer<typeof DESKTOP_RELEASE_RESULT>;

export const DESKTOP_RELEASE_STATUS = z.strictObject({
  desktop: DESKTOP_RELEASE_RESULT.nullable(),
});

export const UPDATE_REFUSALS = [
  'not_owner',
  'identity_same',
  'foreign_app',
  'preflight',
  'busy',
  'rolled_back',
  'failed',
] as const;

export type UpdateRefusal = (typeof UPDATE_REFUSALS)[number];

export const HUB_UPDATE_PHASES = [
  'planned',
  'built',
  'backed_up',
  'applying',
  'verifying',
  'restarting',
  'done',
  'failed',
  'reverting',
  'reverted',
  'unrecoverable',
] as const;

export type HubUpdatePhase = (typeof HUB_UPDATE_PHASES)[number];

export const HUB_UPDATE_CHECK = z.strictObject({
  name: z.string().min(1).max(80),
  ok: z.boolean(),
  detail: z.string().max(2000),
});

export const HUB_UPDATE_ACCEPTANCE = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('started'), runId: ID }),
  z.strictObject({
    status: z.literal('refused'),
    refusal: z.enum(['busy', 'identity_same', 'failed']),
    runId: ID,
    message: z.string().min(1),
  }),
]);

export type HubUpdateAcceptance = z.infer<typeof HUB_UPDATE_ACCEPTANCE>;

export type HubUpdateCheck = z.infer<typeof HUB_UPDATE_CHECK>;

export const HUB_UPDATE_BOOT_RECEIPT_FILE = 'hub-update-boot.json';
export const HUB_UPDATE_BOOT_RECEIPT = z.strictObject({ runId: ID });

export const HUB_UPDATE_ORIGIN = z.strictObject({ chatId: ID, profileId: ID });

export type HubUpdateOrigin = z.infer<typeof HUB_UPDATE_ORIGIN>;

export const HUB_UPDATE_RELEASE = z.strictObject({
  runId: ID,
  origin: HUB_UPDATE_ORIGIN.optional(),
  remoteTip: HUB_UPDATE_COMMIT.optional(),
  phase: z.enum(HUB_UPDATE_PHASES),
  notes: z.string().min(1).max(500),
  build: PATH.nullable(),
  backup: PATH.nullable(),
  url: z.url({ protocol: /^https?$/u }),
  healthFile: PATH,
  watchdogUnit: z.string().min(1).max(120),
  startingSchema: z.int().min(0).nullable(),
  changedDatabase: z.boolean(),
  installs: z.array(PATH),
  checks: z.array(HUB_UPDATE_CHECK),
  failedChecks: z.array(HUB_UPDATE_CHECK),
  reason: z.string().min(1).max(2000).nullable(),
  interrupted: z.boolean(),
  revision: z.int().nonnegative(),
  startedAt: MOMENT,
  updatedAt: MOMENT,
  finishedAt: MOMENT.nullable(),
});

export type HubUpdateRelease = z.infer<typeof HUB_UPDATE_RELEASE>;

export const HUB_UPDATE_LEDGER = z.strictObject({ releases: z.array(HUB_UPDATE_RELEASE) });

export type HubUpdateLedger = z.infer<typeof HUB_UPDATE_LEDGER>;

export const HUB_HEALTHY = 'healthy';

export const SELF_UPDATE_ROOT = 'self-update';

export const SELF_UPDATE_RECOVERY_PATH = '/api/self-update-recovery';

export const SELF_UPDATE_MODULE = 'tooling/self-update-watchdog.ts';

export const SELF_UPDATE_SOCKET = 'self-update.sock';

export const HUB_UPDATE_WATCHDOG_FILE = 'hub-update-watchdog.mjs';

export const HUB_UPDATE_WATCHDOG_LOG = 'hub-update-watchdog.log';

export const HUB_UPDATE_RESTART_WAIT_MS = 30_000;

export const HUB_STARTUP_DEADLINE_MS = 120_000;

export const HUB_UPDATE_LOG = 'self-update/hub-update.log';

export const HUB_UPDATE_DATABASE_FILE = 'smarteverything.db';

export const DATABASE_SUFFIXES = ['', '-wal', '-shm'] as const;

export const HUB_UNIT = 'smarteverything.service';

export function withRelease(ledger: HubUpdateLedger, release: HubUpdateRelease): HubUpdateLedger {
  const kept = ledger.releases.filter((entry) => entry.runId !== release.runId);
  return HUB_UPDATE_LEDGER.parse({ releases: [...kept, release] });
}

export function releaseOf(
  ledger: HubUpdateLedger,
  runId: string | null,
): HubUpdateRelease | undefined {
  return runId === null ? undefined : ledger.releases.find((entry) => entry.runId === runId);
}

export type HubUpdateChange = Partial<
  Pick<HubUpdateRelease, 'reason' | 'failedChecks' | 'interrupted' | 'startingSchema'>
>;

export function phaseOf(
  release: HubUpdateRelease,
  phase: HubUpdatePhase,
  change: HubUpdateChange,
  now: Date,
): HubUpdateRelease {
  return {
    ...release,
    ...change,
    phase,
    revision: release.revision + 1,
    updatedAt: now.toISOString(),
    finishedAt: hubUpdateFinished({ ...release, phase }) ? now.toISOString() : null,
  };
}

export function failedBecause(checks: readonly HubUpdateCheck[]): string {
  return checks
    .filter((check) => !check.ok)
    .map((check) => `${check.name}: ${check.detail}`)
    .join('; ');
}

export const HUB_UPDATE_FINAL: ReadonlySet<HubUpdatePhase> = new Set([
  'done',
  'failed',
  'reverted',
  'unrecoverable',
]);

export const HUB_UPDATE_OUTCOMES = ['updated', 'failed', 'reverted', 'unrecoverable'] as const;

export type HubUpdateOutcome = (typeof HUB_UPDATE_OUTCOMES)[number];

const OUTCOME_OF: Readonly<Partial<Record<HubUpdatePhase, HubUpdateOutcome>>> = {
  done: 'updated',
  failed: 'failed',
  reverted: 'reverted',
  unrecoverable: 'unrecoverable',
};

export function hubUpdateFinished(release: Pick<HubUpdateRelease, 'phase'>): boolean {
  return HUB_UPDATE_FINAL.has(release.phase);
}

export function hubUpdateOutcome(
  release: Pick<HubUpdateRelease, 'phase'>,
): HubUpdateOutcome | null {
  return OUTCOME_OF[release.phase] ?? null;
}
