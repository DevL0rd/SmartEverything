import { vi } from 'vitest';
import type { AppUpdateOutcome, AppUpdateSummary } from '@smarteverything/domain';
import type { AdapterStart, RestartRequest, UpdateAdapter } from '../model/adapter';
import type { CheckOutcome } from '../model/update-state';
import type { AppUpdatePrefs } from './update-prefs';
import { AppUpdateController, type ControllerDeps } from './update-controller';

export const OFFER: AppUpdateSummary = {
  id: '7d0a2f6e-56a4-4c1b-9d43-0e7b3b7f1c11',
  createdAt: '2026-10-24T10:00:00.000Z',
  appVersion: '1.4.0',
  notes: 'Faster camera start',
  size: 1024,
};

export const REPLACEMENT: AppUpdateSummary = {
  ...OFFER,
  id: '7d0a2f6e-56a4-4c1b-9d43-0e7b3b7f1c12',
  notes: 'Clearer camera controls',
};

export const RUNNING_OFFER: AdapterStart = {
  kind: 'started',
  running: { kind: 'update', id: OFFER.id, createdAt: OFFER.createdAt, appVersion: '1.4.0' },
  runtimeVersion: 'runtime-a',
  emergency: null,
};

export const FOUND: CheckOutcome = { compatible: OFFER, newer: null, rollBackToEmbedded: false };

export const WITHDRAWN: CheckOutcome = { compatible: null, newer: null, rollBackToEmbedded: true };

export function noticeFor(
  id: string | null,
  runtimeVersion = 'runtime-a',
): Parameters<AppUpdateController['receiveNotice']>[0] {
  return { type: 'app_update', platform: 'android', channel: 'release', runtimeVersion, id };
}

interface Setup {
  readonly start?: AdapterStart;
  readonly outcome?: CheckOutcome;
  readonly prefs?: Partial<AppUpdatePrefs>;
}

export interface World {
  readonly controller: AppUpdateController;
  readonly adapter: UpdateAdapter;
  readonly ask: ReturnType<typeof vi.fn<ControllerDeps['ask']>>;
  readonly reports: AppUpdateOutcome[];
  readonly prefs: () => AppUpdatePrefs;
  readonly setBusy: (busy: boolean) => void;
  readonly clickTray: () => void;
  readonly trayListening: () => boolean;
}

interface Tray {
  readonly click: () => void;
  readonly listening: () => boolean;
  readonly listen: (listener: () => void) => () => void;
}

function trayOf(): Tray {
  let listener: (() => void) | null = null;
  return {
    click: (): void => {
      listener?.();
    },
    listening: (): boolean => listener !== null,
    listen: (next: () => void): (() => void) => {
      listener = next;
      return (): void => {
        listener = null;
      };
    },
  };
}

function adapterOf(options: Setup, tray: Tray): UpdateAdapter {
  return {
    platform: 'android',
    app: 'apk',
    start: vi.fn((): Promise<AdapterStart> =>
      Promise.resolve(
        options.start ?? {
          kind: 'started',
          running: { kind: 'embedded', builtAt: null },
          runtimeVersion: 'runtime-a',
          emergency: null,
        },
      ),
    ),
    check: vi.fn(() => Promise.resolve(options.outcome ?? FOUND)),
    download: vi.fn((_offer: AppUpdateSummary, onProgress: (progress: number) => void) => {
      onProgress(0.5);
      return Promise.resolve();
    }),
    prepareRollback: vi.fn(() => Promise.resolve()),
    restart: vi.fn((request: RestartRequest) => {
      request.onApplying?.();
      return Promise.resolve();
    }),
    onConfirmRequested: tray.listen,
  };
}

export function setup(options: Setup = {}): World {
  let prefs: AppUpdatePrefs = {
    channel: 'release',
    launchedId: null,
    pendingId: null,
    ...options.prefs,
  };
  let busy = false;
  const tray = trayOf();
  const reports: AppUpdateOutcome[] = [];
  const ask = vi.fn<ControllerDeps['ask']>(() => Promise.resolve(true));
  const adapter = adapterOf(options, tray);
  const controller = new AppUpdateController({
    adapter,
    report: (outcome): Promise<void> => {
      reports.push(outcome);
      return Promise.resolve();
    },
    prefs: (): AppUpdatePrefs => prefs,
    changePrefs: (change): void => {
      prefs = { ...prefs, ...change };
    },
    token: (): string => 'token',
    busy: (): boolean => busy,
    ask,
    now: (): number => Date.parse('2026-10-25T09:00:00.000Z'),
  });
  return {
    controller,
    adapter,
    ask,
    reports,
    prefs: (): AppUpdatePrefs => prefs,
    setBusy: (next: boolean): void => {
      busy = next;
      controller.busyChanged(next);
    },
    clickTray: tray.click,
    trayListening: tray.listening,
  };
}

export async function settle(): Promise<void> {
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
}

export function deferCheck(world: World): (outcome: CheckOutcome) => void {
  let finishCheck: (outcome: CheckOutcome) => void = () => undefined;
  vi.mocked(world.adapter.check).mockReturnValueOnce(
    new Promise<CheckOutcome>((resolve) => {
      finishCheck = resolve;
    }),
  );
  return finishCheck;
}
