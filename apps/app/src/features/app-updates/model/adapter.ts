import type {
  AppUpdateChannel,
  AppUpdatePlatform,
  AppUpdateSummary,
} from '@smarteverything/domain';
import type { CheckOutcome, NewAppKind, RestartTarget, RunningVersion } from './update-state';

export const RELEASE_UPDATE_CHANNEL = 'release';

export interface EmergencyLaunch {
  readonly failedId: string | null;
  readonly reason: string | null;
}

export type UpdateFailureCause = 'check' | 'download' | 'restart' | 'launch';

export class UpdateFailure extends Error {
  override readonly name = 'UpdateFailure';

  constructor(
    override readonly cause: UpdateFailureCause,
    readonly sentence: string,
    readonly detail: string,
    readonly staysReady = false,
  ) {
    super(sentence);
  }
}

export type AdapterStart =
  | { readonly kind: 'unsupported'; readonly reason: string }
  | {
      readonly kind: 'started';
      readonly running: RunningVersion | null;
      readonly runtimeVersion: string | null;
      readonly emergency: EmergencyLaunch | null;
    };

export interface CheckRequest {
  readonly channel: AppUpdateChannel;
}

export interface RestartRequest extends CheckRequest {
  readonly target: RestartTarget;
  readonly onApplying?: () => void;
}

export interface UpdateAdapter {
  readonly platform: AppUpdatePlatform;
  readonly app: NewAppKind;
  readonly start: () => Promise<AdapterStart>;
  readonly check: (request: CheckRequest) => Promise<CheckOutcome>;
  readonly download: (
    offer: AppUpdateSummary,
    onProgress: (progress: number) => void,
  ) => Promise<void>;
  readonly prepareRollback: () => Promise<void>;
  readonly restart: (request: RestartRequest) => Promise<void>;
  readonly onConfirmRequested?: (listener: () => void) => () => void;
}

export function unsupportedAdapter(platform: AppUpdatePlatform, reason: string): UpdateAdapter {
  const refuse = (): Promise<never> => Promise.reject(new AppUpdateUnsupportedError(reason));
  return {
    platform,
    app: platform === 'android' ? 'apk' : 'installer',
    start: () => Promise.resolve({ kind: 'unsupported', reason }),
    check: refuse,
    download: refuse,
    prepareRollback: refuse,
    restart: refuse,
  };
}

export class AppUpdateUnsupportedError extends Error {
  override readonly name = 'AppUpdateUnsupportedError';
}
