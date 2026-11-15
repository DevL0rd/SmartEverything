import { useEffect } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { href } from '../../../app-shell/hrefs';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { useMutationState, type MutationState } from '../../../store/mutation';
import type { MediaItem } from '../viewer/info-model';
import { revertPhotoEdit } from './api';
import { jobViewOf, type EditJobView } from './job-view';
import { forgetEditJob, refreshEdited, useEditJob, usePhotoEdit } from './queries';

export interface EditEntry {
  readonly label: string;
  readonly available: boolean;
  readonly busy: boolean;
  readonly onEdit: () => void;
  readonly onRevert: (() => void) | null;
  readonly job: EditJobView | null;
}

function revertOf(item: MediaItem, mutation: MutationState, refresh: () => void): () => void {
  return (): void => {
    confirm({
      title: 'Revert to the original?',
      body: 'The edits are removed. The edited photo stays in Drive versions.',
      confirmLabel: 'Revert',
      tone: 'destructive',
    })
      .then((accepted) => {
        if (!accepted) return;
        mutation.run(() => revertPhotoEdit(item.id), {
          failure: 'The photo was not reverted',
          label: 'photo_revert',
          onDone: () => {
            refresh();
            notify({ message: 'Reverted to the original', tone: 'positive' });
          },
        });
      })
      .catch((error: unknown) => {
        notify({ message: 'The photo was not reverted', error, tone: 'critical' });
      });
  };
}

function useJobOutcome(item: MediaItem, refresh: () => void): EditJobView | null {
  const tracked = useEditJob(item.id);
  const job = tracked?.job ?? null;
  const state = job?.state ?? null;
  useEffect(() => {
    if (tracked === null || job === null) return;
    if (job.state === 'done') {
      forgetEditJob(item.id, tracked.jobId);
      refresh();
      notify({ message: 'The edited video is saved', tone: 'positive' });
    } else if (job.state === 'failed') {
      forgetEditJob(item.id, tracked.jobId);
      notify({
        message: 'The video edit failed',
        ...(job.error === null ? {} : { detail: job.error }),
        tone: 'critical',
      });
    }
  }, [item.id, tracked, job, refresh]);
  if (tracked === null || state === 'done' || state === 'failed') return null;
  return jobViewOf(job);
}

export function useEditEntry(item: MediaItem): EditEntry {
  const client = useQueryClient();
  const mutation = useMutationState();
  const edit = usePhotoEdit(item.kind === 'image' ? item.id : null);
  const refresh = (): void => {
    refreshEdited(client, item.id);
  };
  const job = useJobOutcome(item, refresh);
  const edited = edit.data?.edited === true;
  return {
    label: item.kind === 'video' ? 'Edit video' : 'Edit',
    available: edit.data?.canEdit !== false,
    busy: mutation.busy || job !== null,
    onEdit: (): void => {
      router.push(href.photosEdit(item.id));
    },
    onRevert: edited ? revertOf(item, mutation, refresh) : null,
    job,
  };
}
