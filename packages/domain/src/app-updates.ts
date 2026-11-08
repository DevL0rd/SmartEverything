import { z } from 'zod';
import { RELEASE_NOTES } from './release-notes';
import { JSON_VALUE } from './values';

export const APP_UPDATE_PLATFORMS = ['android', 'desktop'] as const;

export type AppUpdatePlatform = (typeof APP_UPDATE_PLATFORMS)[number];

export const APP_UPDATE_CHANNELS = ['release', 'dev'] as const;

export type AppUpdateChannel = (typeof APP_UPDATE_CHANNELS)[number];

export const APP_UPDATE_MANIFEST_PATH = '/api/app-update/manifest';

export const APP_UPDATE_BROADCAST_INDEX_FILE = 'index.json';

export const APP_UPDATE_TARGETED_INDEX_FILE = 'targeted-index.json';

const PLATFORM = z.enum(APP_UPDATE_PLATFORMS);

const CHANNEL = z.enum(APP_UPDATE_CHANNELS);

export const APP_UPDATE_KEY = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/u);

export const APP_UPDATE_KEY_REPLY = z.strictObject({ key: APP_UPDATE_KEY });

export type AppUpdateKeyReply = z.infer<typeof APP_UPDATE_KEY_REPLY>;

const APPLICATION_ID = z.string().regex(/^[A-Za-z][\w]*(?:\.[A-Za-z][\w]*)+$/u);
const ANDROID_BUILD_CODE = z.string().regex(/^[1-9][0-9]{0,9}$/u);

export const ANDROID_APP_BUILD = z.strictObject({
  applicationId: APPLICATION_ID,
  versionCode: ANDROID_BUILD_CODE,
});

export type AndroidAppBuild = z.infer<typeof ANDROID_APP_BUILD>;

export const APP_UPDATE_EXTRA_PARAMS = z.strictObject({
  channel: CHANNEL,
  key: APP_UPDATE_KEY,
  download: z.uuid().optional(),
});

export type AppUpdateExtraParams = z.infer<typeof APP_UPDATE_EXTRA_PARAMS>;

const RUNTIME_VERSION = z.string().min(1);

const MOMENT = z.iso.datetime({ offset: true });

export const ANDROID_APP_BUILD_REPORT = ANDROID_APP_BUILD.extend({
  runtimeVersion: RUNTIME_VERSION,
  channel: CHANNEL,
  currentUpdateId: z.uuid().nullable(),
});

export type AndroidAppBuildReport = z.infer<typeof ANDROID_APP_BUILD_REPORT>;

export const APP_UPDATE_OUTCOMES = ['applied', 'rolled_back', 'download_failed'] as const;

export type AppUpdateOutcomeKind = (typeof APP_UPDATE_OUTCOMES)[number];

export const APP_UPDATE_OUTCOME_REASON_MAX_LENGTH = 500;

export const APP_UPDATE_OUTCOME = z.strictObject({
  updateId: z.uuid().nullable(),
  outcome: z.enum(APP_UPDATE_OUTCOMES),
  reason: z.string().trim().min(1).max(APP_UPDATE_OUTCOME_REASON_MAX_LENGTH).nullable(),
});

export type AppUpdateOutcome = z.infer<typeof APP_UPDATE_OUTCOME>;

export const APP_UPDATE_RECORDED_OUTCOME = APP_UPDATE_OUTCOME.extend({ recordedAt: MOMENT });

export type AppUpdateRecordedOutcome = z.infer<typeof APP_UPDATE_RECORDED_OUTCOME>;

export const ANDROID_APP_OBSERVATION = ANDROID_APP_BUILD_REPORT.extend({
  observedAt: MOMENT,
  lastOutcome: APP_UPDATE_RECORDED_OUTCOME.nullable(),
});

export type AndroidAppObservation = z.infer<typeof ANDROID_APP_OBSERVATION>;

export const PAIRED_ANDROID_BUILD = z.strictObject({
  clientId: z.uuid(),
  observation: ANDROID_APP_OBSERVATION,
});

export type PairedAndroidBuild = z.infer<typeof PAIRED_ANDROID_BUILD>;

function staysInside(path: string): boolean {
  if (path.startsWith('/') || path.includes('\\')) return false;
  return path.split('/').every((segment) => segment !== '' && segment !== '..');
}

export const APP_UPDATE_FILE_PATH = z.string().refine(staysInside, {
  message:
    'must be a relative path with no empty folder, no .. folder, no leading slash and no backslash',
});

export const APP_UPDATE_FILE = z.strictObject({
  path: APP_UPDATE_FILE_PATH,
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  size: z.int().nonnegative(),
  contentType: z.string().min(1),
  fileExtension: z
    .string()
    .regex(/^\.[^/\\]+$/u)
    .optional(),
});

export type AppUpdateFile = z.infer<typeof APP_UPDATE_FILE>;

export const APP_UPDATE_WITHDRAWN = z.strictObject({
  at: MOMENT,
  reason: z.string().min(1),
});

export type AppUpdateWithdrawn = z.infer<typeof APP_UPDATE_WITHDRAWN>;

const EXPO_CLIENT = z.record(z.string(), JSON_VALUE);

const ANDROID_PACKAGE_HOLDER = z.looseObject({ package: z.string().min(1) });

const ANDROID_EXPO_CLIENT = EXPO_CLIENT.refine(
  (client) => ANDROID_PACKAGE_HOLDER.safeParse(client['android']).success,
  { message: 'must name the Android package in android.package' },
);

const ENTRY_FIELDS = {
  id: z.uuid(),
  clientId: z.uuid().optional(),
  channel: CHANNEL,
  runtimeVersion: RUNTIME_VERSION,
  createdAt: MOMENT,
  appVersion: z.string().min(1),
  notes: RELEASE_NOTES,
  files: z.array(APP_UPDATE_FILE),
  withdrawn: APP_UPDATE_WITHDRAWN.nullable(),
} as const;

const ANDROID_ENTRY = z.strictObject({
  ...ENTRY_FIELDS,
  platform: z.literal('android'),
  launch: APP_UPDATE_FILE,
  expoClient: ANDROID_EXPO_CLIENT,
});

const DESKTOP_ENTRY = z.strictObject({
  ...ENTRY_FIELDS,
  platform: z.literal('desktop'),
  launch: APP_UPDATE_FILE.nullable(),
  expoClient: EXPO_CLIENT.nullable(),
});

export const APP_UPDATE_ENTRY = z.discriminatedUnion('platform', [ANDROID_ENTRY, DESKTOP_ENTRY]);

export type AppUpdateEntry = z.infer<typeof APP_UPDATE_ENTRY>;

export const APP_UPDATE_INDEX = z.strictObject({ entries: z.array(APP_UPDATE_ENTRY) });

export type AppUpdateIndex = z.infer<typeof APP_UPDATE_INDEX>;

export const APP_UPDATE_TARGET = z.strictObject({
  platform: PLATFORM,
  channel: CHANNEL,
  runtimeVersion: RUNTIME_VERSION,
});

export type AppUpdateTarget = z.infer<typeof APP_UPDATE_TARGET>;

export const APP_UPDATE_QUERY = APP_UPDATE_TARGET.extend({
  currentId: z.uuid().optional(),
});

export type AppUpdateQuery = z.infer<typeof APP_UPDATE_QUERY>;

export const APP_UPDATE_SUMMARY = z.strictObject({
  id: z.uuid(),
  createdAt: MOMENT,
  appVersion: z.string().min(1),
  notes: RELEASE_NOTES,
  size: z.int().nonnegative(),
});

export type AppUpdateSummary = z.infer<typeof APP_UPDATE_SUMMARY>;

export const APP_UPDATE_LISTING = APP_UPDATE_SUMMARY.extend({
  clientId: z.uuid().optional(),
  platform: PLATFORM,
  channel: CHANNEL,
  runtimeVersion: RUNTIME_VERSION,
  withdrawn: APP_UPDATE_WITHDRAWN.nullable(),
});

export type AppUpdateListing = z.infer<typeof APP_UPDATE_LISTING>;

export const APP_UPDATE_OFFER_FILE = APP_UPDATE_FILE.extend({ url: z.string().min(1) });

export type AppUpdateOfferFile = z.infer<typeof APP_UPDATE_OFFER_FILE>;

export const APP_UPDATE_COMPATIBLE = APP_UPDATE_SUMMARY.extend({
  files: z.array(APP_UPDATE_OFFER_FILE),
});

export type AppUpdateCompatible = z.infer<typeof APP_UPDATE_COMPATIBLE>;

export const APP_UPDATE_OFFER = z.strictObject({
  compatible: APP_UPDATE_COMPATIBLE.nullable(),
  newerIncompatible: APP_UPDATE_SUMMARY.nullable(),
  rollBackToEmbedded: z.boolean(),
});

export type AppUpdateOffer = z.infer<typeof APP_UPDATE_OFFER>;

export const APP_UPDATE_NOTICE = z.strictObject({
  type: z.literal('app_update'),
  platform: PLATFORM,
  channel: CHANNEL,
  runtimeVersion: RUNTIME_VERSION,
  id: z.uuid().nullable(),
});

export type AppUpdateNotice = z.infer<typeof APP_UPDATE_NOTICE>;

type Selectable = Pick<
  AppUpdateEntry,
  'id' | 'clientId' | 'platform' | 'channel' | 'runtimeVersion' | 'createdAt' | 'withdrawn'
>;

type AppUpdateAudience = AppUpdateTarget & { readonly clientId?: string | undefined };

function visibleTo(entry: Selectable, target: AppUpdateAudience): boolean {
  return entry.clientId === undefined || entry.clientId === target.clientId;
}

function inScope(entry: Selectable, target: AppUpdateAudience): boolean {
  return (
    entry.withdrawn === null &&
    entry.platform === target.platform &&
    entry.channel === target.channel &&
    visibleTo(entry, target)
  );
}

function newest<E extends Selectable>(entries: readonly E[]): E | null {
  return entries.reduce<E | null>(
    (best, entry) =>
      best === null || Date.parse(entry.createdAt) > Date.parse(best.createdAt) ? entry : best,
    null,
  );
}

export function latestAppUpdate<E extends Selectable>(
  entries: readonly E[],
  target: AppUpdateAudience,
): E | null {
  return newest(
    entries.filter(
      (entry) => inScope(entry, target) && entry.runtimeVersion === target.runtimeVersion,
    ),
  );
}

export function newerIncompatibleUpdate<E extends Selectable>(
  entries: readonly E[],
  target: AppUpdateAudience,
): E | null {
  const other = newest(
    entries.filter(
      (entry) => inScope(entry, target) && entry.runtimeVersion !== target.runtimeVersion,
    ),
  );
  const compatible = latestAppUpdate(entries, target);
  if (other === null) return null;
  if (compatible === null) return other;
  return Date.parse(other.createdAt) > Date.parse(compatible.createdAt) ? other : null;
}

export function rollsBackToEmbedded(
  entries: readonly Selectable[],
  target: AppUpdateAudience,
  currentId: string | null,
): boolean {
  if (currentId === null) return false;
  const current = entries.find((entry) => entry.id === currentId);
  if (
    current?.withdrawn === undefined ||
    current.withdrawn === null ||
    !visibleTo(current, target)
  ) {
    return false;
  }
  return latestAppUpdate(entries, target) === null;
}

export function appUpdateSummaryOf(
  entry: Pick<AppUpdateEntry, 'id' | 'createdAt' | 'appVersion' | 'notes' | 'launch' | 'files'>,
): AppUpdateSummary {
  const size = entry.files.reduce((total, file) => total + file.size, entry.launch?.size ?? 0);
  return {
    id: entry.id,
    createdAt: entry.createdAt,
    appVersion: entry.appVersion,
    notes: entry.notes,
    size,
  };
}
