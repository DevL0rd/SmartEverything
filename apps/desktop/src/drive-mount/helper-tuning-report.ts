import {
  DESKTOP_DRIVE_FOLLOW_MAX_BACKGROUND,
  DESKTOP_DRIVE_PLATFORMS,
  DESKTOP_DRIVE_UNTIL_CHANGED,
  MAX_BACKGROUND_WIRE_LIMIT,
  type DesktopDriveTuning,
  type DesktopDriveTuningLimits,
  type DesktopDriveTuningState,
} from '@smarteverything/domain';
import { MAX_PAYLOAD_BYTES } from '@smarteverything/domain/drive-mount';
import { z } from 'zod';

const COUNT = z.int().nonnegative();
const HELPER_UNTIL_CHANGED = 'untilChanged';
const LIFETIME = z.union([z.literal(HELPER_UNTIL_CHANGED), COUNT]);

export const HELPER_LIMITS_LINE = z.strictObject({
  type: z.literal('limits'),
  platform: z.enum(DESKTOP_DRIVE_PLATFORMS),
  kernel: z.boolean(),
  maxUserBgreq: COUNT.optional(),
  maxUserCongThresh: COUNT.optional(),
  maxPagesLimit: COUNT.optional(),
  pageSize: COUNT.optional(),
  readaheadOffer: COUNT.optional(),
  maxRequestBytes: COUNT.optional(),
});

export const HELPER_APPLIED_LINE = z.strictObject({
  type: z.literal('applied'),
  mount: z.string().min(1),
  platform: z.enum(DESKTOP_DRIVE_PLATFORMS),
  remount: z
    .strictObject({
      maxBackground: COUNT,
      congestionThreshold: COUNT,
      maxRequestBytes: COUNT,
      kernelReadaheadBytes: COUNT,
      asyncRead: z.boolean(),
      writebackCache: z.boolean(),
      readdirPlus: z.enum(['off', 'auto', 'always']),
      parallelDirops: z.boolean(),
    })
    .nullable(),
  live: z.strictObject({
    readAheadBytes: COUNT,
    entrySeconds: LIFETIME,
    attrSeconds: LIFETIME,
    negativeSeconds: LIFETIME,
    closeWaitsForUpload: z.boolean(),
    uploadDelaySeconds: COUNT,
    fsyncWaitsForHub: z.boolean(),
    uploadFiles: COUNT,
    uploadFramesInFlight: COUNT,
    pingSeconds: COUNT,
    deadAfterSeconds: COUNT,
    bulkFrameBytes: COUNT,
    prefetchSmallFiles: z.boolean(),
  }),
});

export type HelperLimitsLine = z.infer<typeof HELPER_LIMITS_LINE>;
export type HelperAppliedLine = z.infer<typeof HELPER_APPLIED_LINE>;

export class TuningLimitsMissingError extends Error {
  override readonly name = 'TuningLimitsMissingError';

  constructor(field: string) {
    super(`The mount helper reported kernel limits without ${field}`);
  }
}

function present(value: number | undefined, field: string): number {
  if (value === undefined || value === 0) throw new TuningLimitsMissingError(field);
  return value;
}

function lifetimeOf(value: z.infer<typeof LIFETIME>): number | typeof DESKTOP_DRIVE_UNTIL_CHANGED {
  return value === HELPER_UNTIL_CHANGED ? DESKTOP_DRIVE_UNTIL_CHANGED : value;
}

export function limitsOf(line: HelperLimitsLine): DesktopDriveTuningLimits {
  if (!line.kernel) {
    return {
      platform: line.platform,
      pageBytes: null,
      maxUserBackground: null,
      maxUserCongestionThreshold: null,
      maxRequestBytes: MAX_PAYLOAD_BYTES,
      kernelReadaheadOfferBytes: null,
    };
  }
  return {
    platform: line.platform,
    pageBytes: present(line.pageSize, 'pageSize'),
    maxUserBackground: present(line.maxUserBgreq, 'maxUserBgreq'),
    maxUserCongestionThreshold: present(line.maxUserCongThresh, 'maxUserCongThresh'),
    maxRequestBytes: present(line.maxRequestBytes, 'maxRequestBytes'),
    kernelReadaheadOfferBytes:
      line.readaheadOffer === undefined || line.readaheadOffer === 0 ? null : line.readaheadOffer,
  };
}

function liveTuningOf(live: HelperAppliedLine['live']): Partial<DesktopDriveTuning> {
  return {
    ...live,
    entrySeconds: lifetimeOf(live.entrySeconds),
    attrSeconds: lifetimeOf(live.attrSeconds),
    negativeSeconds: lifetimeOf(live.negativeSeconds),
  };
}

export function appliedTuningOf(
  line: HelperAppliedLine,
  saved: DesktopDriveTuning,
): DesktopDriveTuning {
  return { ...saved, ...line.remount, ...liveTuningOf(line.live) };
}

export class TuningReport {
  private limits: DesktopDriveTuningLimits | null = null;
  private readonly applied = new Map<string, HelperAppliedLine>();

  limit(line: HelperLimitsLine): void {
    this.limits = limitsOf(line);
  }

  apply(line: HelperAppliedLine): void {
    this.applied.set(line.mount, line);
  }

  drop(mount: string): void {
    this.applied.delete(mount);
  }

  clear(): void {
    this.applied.clear();
  }

  current(): DesktopDriveTuningLimits | null {
    return this.limits;
  }

  state(saved: DesktopDriveTuning): DesktopDriveTuningState {
    return {
      saved,
      applied: [...this.applied.values()].map((line) => ({
        placementId: line.mount,
        tuning: appliedTuningOf(line, saved),
      })),
      limits: this.limits,
    };
  }
}

function checkRequest(tuning: DesktopDriveTuning, limits: DesktopDriveTuningLimits): void {
  const { maxRequestBytes } = tuning;
  if (maxRequestBytes > limits.maxRequestBytes) {
    throw new TuningBoundError(
      'maxRequestBytes',
      `must be at most ${String(limits.maxRequestBytes)}`,
    );
  }
  if (limits.pageBytes !== null && maxRequestBytes < limits.pageBytes) {
    throw new TuningBoundError('maxRequestBytes', `must be at least ${String(limits.pageBytes)}`);
  }
}

function checkBackground(tuning: DesktopDriveTuning, userBound: number): void {
  const bound = Math.min(MAX_BACKGROUND_WIRE_LIMIT, userBound);
  if (tuning.maxBackground > bound) {
    throw new TuningBoundError(
      'maxBackground',
      `must be at most ${String(bound)} (the kernel allows up to ${String(userBound)} here)`,
    );
  }
}

function checkCongestion(tuning: DesktopDriveTuning, userBound: number | null): void {
  const congestion =
    tuning.congestionThreshold === DESKTOP_DRIVE_FOLLOW_MAX_BACKGROUND
      ? Math.floor((tuning.maxBackground * 3) / 4)
      : tuning.congestionThreshold;
  const bound = Math.min(tuning.maxBackground, userBound ?? tuning.maxBackground);
  if (congestion > bound) {
    throw new TuningBoundError(
      'congestionThreshold',
      `must be at most ${String(bound)} (the kernel allows up to ${String(userBound)} here)`,
    );
  }
}

function checkReadahead(tuning: DesktopDriveTuning, limits: DesktopDriveTuningLimits): void {
  const { kernelReadaheadBytes } = tuning;
  const { pageBytes, kernelReadaheadOfferBytes } = limits;
  if (pageBytes !== null && kernelReadaheadBytes < pageBytes) {
    throw new TuningBoundError('kernelReadaheadBytes', `must be at least ${String(pageBytes)}`);
  }
  if (kernelReadaheadOfferBytes !== null && kernelReadaheadBytes > kernelReadaheadOfferBytes) {
    throw new TuningBoundError(
      'kernelReadaheadBytes',
      `must be at most ${String(kernelReadaheadOfferBytes)}`,
    );
  }
}

export function validateTuning(
  tuning: DesktopDriveTuning,
  limits: DesktopDriveTuningLimits | null,
): void {
  if (limits === null) return;
  checkRequest(tuning, limits);
  if (limits.maxUserBackground === null) return;
  checkBackground(tuning, limits.maxUserBackground);
  checkCongestion(tuning, limits.maxUserCongestionThreshold);
  checkReadahead(tuning, limits);
}

export class TuningBoundError extends Error {
  override readonly name = 'TuningBoundError';

  constructor(field: string, rule: string) {
    super(`${field} ${rule}`);
  }
}
