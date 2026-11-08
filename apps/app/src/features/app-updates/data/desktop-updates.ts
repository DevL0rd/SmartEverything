import {
  WEB_BUNDLE_EMBEDDED,
  WEB_UPDATE_STATUS,
  type AppUpdateCompatible,
  type AppUpdateSummary,
  type WebUpdateRunning,
  type WebUpdateStatus,
} from '@smarteverything/domain';
import type { DesktopBridge } from '../../../design/platform';
import {
  UpdateFailure,
  type AdapterStart,
  type RestartRequest,
  type UpdateAdapter,
  type UpdateFailureCause,
} from '../model/adapter';
import { asFailure } from '../model/safe-reason';
import type { CheckOutcome, RunningVersion } from '../model/update-state';

type WebUpdateMethod =
  | 'webUpdateStatus'
  | 'checkWebUpdate'
  | 'downloadWebUpdate'
  | 'applyWebUpdate'
  | 'onWebUpdateStatus'
  | 'confirmWebBundle'
  | 'onWebUpdateConfirmRequested';

type WebUpdateBridge = Pick<DesktopBridge, WebUpdateMethod>;

interface Step {
  readonly cause: UpdateFailureCause;
  readonly sentence: string;
  readonly name: string;
}

const CHECK: Step = {
  cause: 'check',
  sentence: 'The app couldn’t check for updates. Try again.',
  name: 'check for updates',
};
const DOWNLOAD: Step = {
  cause: 'download',
  sentence: 'The update couldn’t be downloaded. Try again.',
  name: 'download the update',
};
const RESTART: Step = {
  cause: 'restart',
  sentence: 'The app couldn’t restart to finish the update. Try again.',
  name: 'restart',
};
const ROLLBACK: Step = {
  cause: 'check',
  sentence: 'The app couldn’t go back to the built-in version. Try again.',
  name: 'prepare rollback',
};

function unexpectedState(step: Step, expected: string, status: WebUpdateStatus): UpdateFailure {
  const detail =
    status.state === 'failed'
      ? status.reason
      : `The desktop app was asked to ${step.name} and should report ${expected}, but it reports ${status.state}.`;
  return new UpdateFailure(step.cause, step.sentence, detail);
}

function offerChanged(expectedId: string, receivedId: string): UpdateFailure {
  return new UpdateFailure(
    'download',
    'The update changed while it was downloading. Check for updates again.',
    `The desktop app downloaded ${receivedId} instead of ${expectedId}.`,
  );
}

export function summaryOf(offer: AppUpdateCompatible): AppUpdateSummary {
  const { files: _files, ...summary } = offer;
  return summary;
}

function runningOf(running: WebUpdateRunning): RunningVersion {
  return running.id === WEB_BUNDLE_EMBEDDED
    ? { kind: 'embedded', builtAt: running.createdAt }
    : { kind: 'update', id: running.id, createdAt: running.createdAt, appVersion: null };
}

export function startOf(status: WebUpdateStatus): AdapterStart {
  const started = { kind: 'started', runtimeVersion: null } as const;
  if (status.state === 'disabled') return { kind: 'unsupported', reason: status.reason };
  if (status.state === 'idle') {
    return { ...started, running: runningOf(status.running), emergency: null };
  }
  if (status.state === 'rolled_back') {
    return {
      ...started,
      running: null,
      emergency: { failedId: status.failedId, reason: status.reason },
    };
  }
  return { ...started, running: null, emergency: null };
}

export function checkOutcomeOf(status: WebUpdateStatus): CheckOutcome {
  if (status.state === 'idle') return { compatible: null, newer: null, rollBackToEmbedded: false };
  if (status.state === 'rollback_ready') {
    return { compatible: null, newer: null, rollBackToEmbedded: true };
  }
  if (status.state === 'available') {
    return { compatible: summaryOf(status.offer), newer: null, rollBackToEmbedded: false };
  }
  if (status.state === 'needs_installer') {
    return { compatible: null, newer: status.newer, rollBackToEmbedded: false };
  }
  throw unexpectedState(CHECK, 'idle, available, rollback_ready or needs_installer', status);
}

function expect(step: Step, wanted: WebUpdateStatus['state'], status: WebUpdateStatus): void {
  if (status.state !== wanted) throw unexpectedState(step, wanted, status);
}

async function download(
  web: WebUpdateBridge,
  expectedId: string,
  onProgress: (progress: number) => void,
): Promise<void> {
  const stop = web.onWebUpdateStatus((raw) => {
    const status = WEB_UPDATE_STATUS.parse(raw);
    if (status.state === 'downloading' && status.offer.id === expectedId && status.total > 0) {
      onProgress(status.received / status.total);
    }
  });
  try {
    const status = WEB_UPDATE_STATUS.parse(await web.downloadWebUpdate(expectedId));
    if (status.state !== 'ready') {
      throw unexpectedState(DOWNLOAD, 'ready', status);
    }
    if (status.offer.id !== expectedId) throw offerChanged(expectedId, status.offer.id);
  } finally {
    stop();
  }
}

async function startAfterFirstFrame(web: WebUpdateBridge): Promise<AdapterStart> {
  const status = WEB_UPDATE_STATUS.parse(await web.webUpdateStatus());
  if (status.state !== 'applying') return startOf(status);
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
  await web.confirmWebBundle();
  return startOf(WEB_UPDATE_STATUS.parse(await web.webUpdateStatus()));
}

async function restart(web: WebUpdateBridge, request: RestartRequest): Promise<void> {
  request.onApplying?.();
  const { target } = request;
  const status = WEB_UPDATE_STATUS.parse(
    await web.applyWebUpdate(
      target.kind === 'update' ? { kind: 'update', id: target.offer.id } : target,
    ),
  );
  expect(RESTART, 'applying', status);
}

export function desktopUpdateAdapter(web: WebUpdateBridge): UpdateAdapter {
  return {
    platform: 'desktop',
    app: 'installer',
    start: () => startAfterFirstFrame(web),
    check: (request) =>
      asFailure('check', async () =>
        checkOutcomeOf(WEB_UPDATE_STATUS.parse(await web.checkWebUpdate(request.channel))),
      ),
    download: (offer, onProgress) =>
      asFailure('download', () => download(web, offer.id, onProgress)),
    prepareRollback: () =>
      asFailure('check', async () => {
        expect(ROLLBACK, 'rollback_ready', WEB_UPDATE_STATUS.parse(await web.webUpdateStatus()));
      }),
    restart: (request) => asFailure('restart', () => restart(web, request)),
    onConfirmRequested: (listener) => web.onWebUpdateConfirmRequested(listener),
  };
}
