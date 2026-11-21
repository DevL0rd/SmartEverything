import {
  skipToken,
  useQueries,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { EditJob } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { ValueStore, useValue } from '../../../design/external-store';
import { useScreenQuery } from '../../../queries/use-screen-query';
import type { PhotosResult } from '../../../api/photos';
import { photoKeys } from '../data/keys';
import {
  readPhotoAiStatus,
  readPhotoEdit,
  readPhotoEditBase,
  readPhotoEditJob,
  readPhotoEditPatch,
} from './api';

export function usePhotoEdit(itemId: string | null): UseQueryResult<PhotosResult<'readPhotoEdit'>> {
  return useScreenQuery({
    queryKey: photoKeys.edit(itemId),
    queryFn:
      itemId === null
        ? skipToken
        : ({ signal }): ReturnType<typeof readPhotoEdit> => readPhotoEdit(itemId, signal),
    retry: false,
  });
}

export function usePhotoEditBase(
  itemId: string,
  rev: number,
): UseQueryResult<PhotosResult<'readPhotoEditBase'>> {
  return useScreenQuery({
    queryKey: photoKeys.editBase(itemId, rev),
    queryFn: ({ signal }): ReturnType<typeof readPhotoEditBase> =>
      readPhotoEditBase(itemId, signal),
    retry: false,
    gcTime: 0,
  });
}

export type PatchImages = Readonly<Record<string, string>>;

export interface KeptPatches {
  readonly images: PatchImages | null;
  readonly error: unknown;
  readonly retry: () => void;
}

export function useKeptPatches(itemId: string, patchIds: readonly string[]): KeptPatches {
  const results = useQueries({
    queries: patchIds.map((patchId) => ({
      queryKey: photoKeys.editPatch(itemId, patchId),
      queryFn: ({ signal }): ReturnType<typeof readPhotoEditPatch> =>
        readPhotoEditPatch(itemId, patchId, signal),
      retry: false,
      gcTime: 0,
    })),
  });
  const failed = results.find((result) => result.isError);
  const images: Record<string, string> = {};
  for (const result of results) {
    if (result.data !== undefined) images[result.data.patchId] = result.data.png;
  }
  return {
    images: Object.keys(images).length === patchIds.length ? images : null,
    error: failed?.error ?? null,
    retry: (): void => {
      for (const result of results) {
        if (result.isError) background(result.refetch(), 'photos.editor.retry_failed');
      }
    },
  };
}

export function useEraserKey(enabled: boolean): boolean | null {
  const status = useScreenQuery({
    queryKey: photoKeys.aiStatus(),
    queryFn: enabled
      ? ({ signal }): ReturnType<typeof readPhotoAiStatus> => readPhotoAiStatus(signal)
      : skipToken,
    retry: false,
  });
  return status.data?.hasKey ?? null;
}

export type RunningJobs = Readonly<Record<string, string>>;

export const runningEditJobs = new ValueStore<RunningJobs>({});

export function trackEditJob(itemId: string, jobId: string): void {
  runningEditJobs.set({ ...runningEditJobs.get(), [itemId]: jobId });
}

export function forgetEditJob(itemId: string, jobId: string): void {
  const current = runningEditJobs.get();
  if (current[itemId] !== jobId) return;
  runningEditJobs.set(Object.fromEntries(Object.entries(current).filter(([id]) => id !== itemId)));
}

export function receiveEditJob(client: QueryClient, job: EditJob): void {
  client.setQueryData(photoKeys.editJob(job.itemId, job.id), job);
}

export interface TrackedJob {
  readonly jobId: string;
  readonly job: EditJob | null;
  readonly error: unknown;
}

export function useEditJob(itemId: string): TrackedJob | null {
  const jobId = useValue(runningEditJobs)[itemId] ?? null;
  const query = useScreenQuery({
    queryKey: photoKeys.editJob(itemId, jobId),
    queryFn:
      jobId === null
        ? skipToken
        : ({ signal }): Promise<EditJob> => readPhotoEditJob(jobId, signal),
    retry: false,
  });
  if (jobId === null) return null;
  return { jobId, job: query.data ?? null, error: query.isError ? query.error : null };
}

export function refreshEdited(client: QueryClient, itemId: string): void {
  background(
    client.invalidateQueries({ queryKey: photoKeys.media(itemId) }),
    'photos.editor.refresh_failed',
  );
}
