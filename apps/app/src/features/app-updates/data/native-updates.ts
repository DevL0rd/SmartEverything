import { requireOptionalNativeModule } from 'expo';
import { z } from 'zod';
import type {
  AndroidAppBuildReport,
  AppUpdateExtraParams,
  AppUpdateKeyReply,
  AppUpdateOffer,
  AppUpdateSummary,
} from '@smarteverything/domain';
import type * as ExpoUpdates from 'expo-updates';
import { Logger } from '@smarteverything/logging';
import type { AdapterStart, CheckRequest, RestartRequest, UpdateAdapter } from '../model/adapter';
import { UpdateFailure } from '../model/adapter';
import { failureOf, asFailure } from '../model/safe-reason';
import type { CheckOutcome, RunningVersion } from '../model/update-state';
import { rawErrorText } from '../../../format/errors';
import { androidBuildReport } from './android-build';
import type { OfferRequest } from './hub-offer';

const log = new Logger('app.app-updates');

type Updates = Pick<
  typeof ExpoUpdates,
  | 'isEnabled'
  | 'isEmbeddedLaunch'
  | 'isEmergencyLaunch'
  | 'emergencyLaunchReason'
  | 'updateId'
  | 'createdAt'
  | 'runtimeVersion'
  | 'manifest'
  | 'setUpdateRequestHeadersOverride'
  | 'setExtraParamAsync'
  | 'checkForUpdateAsync'
  | 'fetchUpdateAsync'
  | 'addUpdatesStateChangeListener'
  | 'reloadAsync'
>;

export const METRO_BUILD_REASON = 'This build loads the app from Metro';

interface NativeLaunchApproval {
  readonly approveUpdateAsync: (id: string | null) => Promise<void>;
}

const MANIFEST_ID = z.object({ id: z.uuid() });

const MANIFEST_VERSION = z.object({
  extra: z.object({ expoClient: z.object({ version: z.string().min(1) }) }),
});

const NEW_CHECK = 'Check for updates again.';

function mismatch(cause: 'check' | 'download', expected: string, received: string): UpdateFailure {
  return new UpdateFailure(
    cause,
    `The update changed while it was being fetched. ${NEW_CHECK}`,
    `The phone found ${received}, but the home offers ${expected} for this app.`,
  );
}

function rollbackNotFetched(): UpdateFailure {
  return new UpdateFailure(
    'check',
    'The app couldn’t go back to the built-in version. Try again.',
    'The home asked to go back to the built-in version, but the phone received no such instruction.',
  );
}

function notFetched(expected: string): UpdateFailure {
  return new UpdateFailure(
    'download',
    'The update didn’t download. Try again.',
    `Update ${expected} was expected to download, but the phone received no new update.`,
  );
}

function noRuntime(): UpdateFailure {
  return new UpdateFailure(
    'check',
    'This app build can’t take updates. Install the new app to get updates here.',
    'This app build reports no runtime version, so no update can match it.',
  );
}

function noLongerOffered(): UpdateFailure {
  return new UpdateFailure(
    'restart',
    `This update is no longer available. ${NEW_CHECK}`,
    'The home no longer offers the downloaded update.',
  );
}

export function runningOf(updates: Updates): RunningVersion {
  const createdAt = updates.createdAt?.toISOString() ?? null;
  if (updates.isEmbeddedLaunch || updates.updateId === null || createdAt === null) {
    return { kind: 'embedded', builtAt: createdAt };
  }
  const version = MANIFEST_VERSION.safeParse(updates.manifest);
  return {
    kind: 'update',
    id: updates.updateId,
    createdAt,
    appVersion: version.success ? version.data.extra.expoClient.version : null,
  };
}

function startOf(updates: Updates): AdapterStart {
  if (!updates.isEnabled) return { kind: 'unsupported', reason: METRO_BUILD_REASON };
  updates.setUpdateRequestHeadersOverride(null);
  const emergency = updates.isEmergencyLaunch
    ? { failedId: null, reason: updates.emergencyLaunchReason }
    : null;
  return {
    kind: 'started',
    running: runningOf(updates),
    runtimeVersion: updates.runtimeVersion,
    emergency,
  };
}

export interface HubReads {
  readonly readOffer: (request: OfferRequest) => Promise<AppUpdateOffer>;
  readonly readKey: () => Promise<AppUpdateKeyReply>;
  readonly reportBuild: (report: AndroidAppBuildReport) => Promise<void>;
}

export type Found =
  | { readonly kind: 'update'; readonly id: string }
  | { readonly kind: 'built_in' }
  | { readonly kind: 'none' };

function foundOf(result: ExpoUpdates.UpdateCheckResult): Found {
  if (result.isRollBackToEmbedded) return { kind: 'built_in' };
  return result.isAvailable
    ? { kind: 'update', id: MANIFEST_ID.parse(result.manifest).id }
    : { kind: 'none' };
}

async function sendParams(updates: Updates, params: AppUpdateExtraParams): Promise<void> {
  await updates.setExtraParamAsync('channel', params.channel);
  await updates.setExtraParamAsync('key', params.key);
  await updates.setExtraParamAsync('download', null);
}

function offerRequest(updates: Updates, request: CheckRequest): OfferRequest {
  const runtimeVersion = updates.runtimeVersion;
  if (runtimeVersion === null) throw noRuntime();
  return {
    platform: 'android',
    channel: request.channel,
    runtimeVersion,
    currentId: updates.isEmbeddedLaunch ? null : updates.updateId,
  };
}

function reportBuild(updates: Updates, hub: HubReads, offer: OfferRequest): void {
  const report = androidBuildReport({
    runtimeVersion: offer.runtimeVersion,
    channel: offer.channel,
    currentUpdateId: offer.currentId,
  });
  if (report === null) {
    log.warn('app_update.build_unreadable', { runtimeVersion: updates.runtimeVersion });
    return;
  }
  hub.reportBuild(report).catch((error: unknown) => {
    log.warn('app_update.build_report_failed', { reason: rawErrorText(error) });
  });
}

async function check(
  updates: Updates,
  hub: HubReads,
  request: CheckRequest,
): Promise<CheckOutcome> {
  const target = offerRequest(updates, request);
  reportBuild(updates, hub, target);
  const [offer, { key }] = await Promise.all([hub.readOffer(target), hub.readKey()]);
  await sendParams(updates, { channel: request.channel, key });
  return outcomeOf(offer, foundOf(await updates.checkForUpdateAsync()));
}

function offeredOf(offer: AppUpdateOffer): string {
  return offer.compatible === null ? 'no update' : `update ${offer.compatible.id}`;
}

export function outcomeOf(offer: AppUpdateOffer, found: Found): CheckOutcome {
  const newer = offer.newerIncompatible;
  switch (found.kind) {
    case 'none':
      return { compatible: null, newer, rollBackToEmbedded: false };
    case 'built_in':
      if (!offer.rollBackToEmbedded) {
        throw mismatch('check', offeredOf(offer), 'a return to the built-in version');
      }
      return { compatible: null, newer, rollBackToEmbedded: true };
    case 'update': {
      if (offer.compatible?.id !== found.id) {
        throw mismatch('check', offeredOf(offer), `update ${found.id}`);
      }
      const { files: _files, ...summary } = offer.compatible;
      return { compatible: summary, newer, rollBackToEmbedded: false };
    }
  }
}

async function resetDownload(updates: Updates): Promise<void> {
  try {
    await updates.setExtraParamAsync('download', null);
  } catch (error) {
    log.warn('app_update.download_reset_failed', { reason: rawErrorText(error) });
  }
}

async function download(
  updates: Updates,
  offer: AppUpdateSummary,
  onProgress: (progress: number) => void,
): Promise<void> {
  const watch = updates.addUpdatesStateChangeListener(({ context }) => {
    if (context.isDownloading) onProgress(context.downloadProgress);
  });
  try {
    await updates.setExtraParamAsync('download', offer.id);
    const fetched = await updates.fetchUpdateAsync();
    if (!fetched.isNew) throw notFetched(offer.id);
    const downloaded = MANIFEST_ID.parse(fetched.manifest).id;
    if (downloaded !== offer.id)
      throw mismatch('download', `update ${offer.id}`, `update ${downloaded}`);
    onProgress(1);
  } finally {
    watch.remove();
    await resetDownload(updates);
  }
}

async function prepareRollback(updates: Updates): Promise<void> {
  const fetched = await updates.fetchUpdateAsync();
  if (!fetched.isRollBackToEmbedded) throw rollbackNotFetched();
}

async function confirmedId(
  updates: Updates,
  hub: HubReads,
  request: RestartRequest,
): Promise<string | null> {
  if (request.target.kind !== 'update') return null;
  const offer = await hub.readOffer(offerRequest(updates, request));
  if (offer.compatible?.id !== request.target.offer.id) throw noLongerOffered();
  return offer.compatible.id;
}

async function revokeApproval(approval: NativeLaunchApproval): Promise<void> {
  try {
    await approval.approveUpdateAsync(null);
  } catch (error) {
    log.error('app_update.approval_revoke_failed', error);
  }
}

async function restart(
  updates: Updates,
  hub: HubReads,
  approval: NativeLaunchApproval,
  request: RestartRequest,
): Promise<void> {
  const id = await confirmedId(updates, hub, request);
  request.onApplying?.();
  try {
    await approval.approveUpdateAsync(id);
    await updates.reloadAsync();
  } catch (error) {
    await revokeApproval(approval);
    throw error;
  }
}

async function restartFailing(
  updates: Updates,
  hub: HubReads,
  approval: NativeLaunchApproval,
  request: RestartRequest,
): Promise<void> {
  try {
    await restart(updates, hub, approval, request);
  } catch (error) {
    throw error instanceof UpdateFailure ? error : failureOf('restart', error);
  }
}

export function nativeAdapterOf(
  updates: Updates,
  hub: HubReads,
  approval: NativeLaunchApproval,
): UpdateAdapter {
  return {
    platform: 'android',
    app: 'apk',
    start: () => Promise.resolve(startOf(updates)),
    check: (request) => asFailure('check', () => check(updates, hub, request)),
    download: (offer, onProgress) =>
      asFailure('download', () => download(updates, offer, onProgress)),
    prepareRollback: () => asFailure('check', () => prepareRollback(updates)),
    restart: (request) => restartFailing(updates, hub, approval, request),
  };
}

export async function nativeUpdateAdapter(hub: HubReads): Promise<UpdateAdapter> {
  const approval = requireOptionalNativeModule<NativeLaunchApproval>('ExpoUpdates');
  if (approval === null || typeof approval.approveUpdateAsync !== 'function') {
    throw new Error('The ExpoUpdates native module with approveUpdateAsync is required.');
  }
  const updates = await import('expo-updates');
  return nativeAdapterOf(updates, hub, approval);
}
