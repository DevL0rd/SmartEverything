import { useQuery, type Query, type UseQueryResult } from '@tanstack/react-query';
import type { MediaSize } from '@smarteverything/domain';
import { cameraSnapshotLink, linkLifetimeMs, type SignedLink } from '../../../api/media';
import { cameraSnapshotKey } from '../../../queries/keys';

function linkFresh(query: Query<SignedLink, Error, SignedLink, readonly string[]>): number {
  return linkLifetimeMs(query.state.data?.expiresAt);
}

export function snapshotQuery(
  deviceId: string,
  size: MediaSize,
): {
  readonly queryKey: readonly string[];
  readonly queryFn: () => Promise<SignedLink>;
  readonly staleTime: typeof linkFresh;
} {
  return {
    queryKey: cameraSnapshotKey(deviceId, size),
    queryFn: () => cameraSnapshotLink(deviceId, size),
    staleTime: linkFresh,
  };
}

export function useSnapshotLink(
  deviceId: string,
  size: MediaSize,
  enabled: boolean,
): UseQueryResult<SignedLink> {
  return useQuery({ ...snapshotQuery(deviceId, size), enabled });
}
