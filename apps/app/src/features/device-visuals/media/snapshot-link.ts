import {
  type Query,
  type QueryClient,
  type QueryKey,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  ApiError,
  isPrivate,
  privacySwitchOf,
  type ApiErrorCode,
  type CameraReach,
  type MediaSize,
} from '@smarteverything/domain';
import { cameraSnapshotLink, linkLifetimeMs, type SignedLink } from '../../../api/media';
import { cameraSnapshotKey } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { deviceValuesOf, type StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';

export type SnapshotCondition = 'offline' | 'private' | 'streamable';

export interface SnapshotReadiness {
  readonly condition: SnapshotCondition;
  readonly reach: CameraReach['state'] | null;
}

const REFUSALS: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>([
  'camera_unavailable',
  'camera_offline',
  'camera_privacy_on',
  'firewall_blocked',
]);

export function isSnapshotRefusal(error: unknown): boolean {
  return error instanceof ApiError && REFUSALS.has(error.code);
}

function retrySnapshot(failures: number, error: Error): boolean {
  return !isSnapshotRefusal(error) && failures < 1;
}

function retrySnapshotOnMount(query: Query<SignedLink, Error, SignedLink>): boolean {
  return !isSnapshotRefusal(query.state.error);
}

export function snapshotConditionOf(state: StoreState, deviceId: string): SnapshotCondition {
  const device = state.tables.devices.byId[deviceId];
  if (device?.online !== true) {
    return 'offline';
  }
  const privacy = privacySwitchOf(device);
  if (privacy === null) {
    return 'streamable';
  }
  return isPrivate(privacy, deviceValuesOf(state, deviceId)[privacy.key]?.value)
    ? 'private'
    : 'streamable';
}

export function snapshotReachOf(state: StoreState, deviceId: string): CameraReach['state'] | null {
  const reach = state.firewall?.cameras.find((camera) => camera.deviceId === deviceId);
  return reach === undefined ? null : reach.state;
}

export function snapshotReadinessOf(state: StoreState, deviceId: string): SnapshotReadiness {
  return {
    condition: snapshotConditionOf(state, deviceId),
    reach: snapshotReachOf(state, deviceId),
  };
}

function linkFresh(query: Query<SignedLink, Error, SignedLink>): number {
  return linkLifetimeMs(query.state.data?.expiresAt);
}

export function snapshotQuery(
  deviceId: string,
  size: MediaSize,
  readiness: SnapshotReadiness,
): {
  readonly queryKey: QueryKey;
  readonly queryFn: (context: { readonly signal: AbortSignal }) => Promise<SignedLink>;
  readonly staleTime: typeof linkFresh;
  readonly enabled: boolean;
  readonly retry: typeof retrySnapshot;
  readonly retryOnMount: typeof retrySnapshotOnMount;
} {
  return {
    queryKey: [...cameraSnapshotKey(deviceId, size), readiness.condition, readiness.reach],
    queryFn: ({ signal }) => cameraSnapshotLink(deviceId, size, { signal }),
    staleTime: linkFresh,
    enabled: readiness.condition === 'streamable',
    retry: retrySnapshot,
    retryOnMount: retrySnapshotOnMount,
  };
}

export function useSnapshotReadiness(deviceId: string): SnapshotReadiness {
  const condition = useStoreSelector((state) => snapshotConditionOf(state, deviceId), Object.is, [
    deviceId,
  ]);
  const reach = useStoreSelector((state) => snapshotReachOf(state, deviceId), Object.is, [
    deviceId,
  ]);
  return { condition, reach };
}

export function snapshotRefused(client: QueryClient, queryKey: QueryKey): boolean {
  return isSnapshotRefusal(client.getQueryState(queryKey)?.error);
}

export function useSnapshotLink(
  deviceId: string,
  size: MediaSize,
  readiness: SnapshotReadiness,
): UseQueryResult<SignedLink> {
  return useScreenQuery(snapshotQuery(deviceId, size, readiness));
}
