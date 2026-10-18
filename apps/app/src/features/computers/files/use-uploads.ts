import { background } from '@smarteverything/logging';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { notify } from '../../../components/toast-store';
import { pickFiles, type PickedFile } from '../../../platform/pick-files';
import { UploadQueue } from './upload-queue';

export interface Uploads {
  readonly queue: UploadQueue;
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly add: (files: readonly PickedFile[]) => void;
  readonly pick: () => void;
}

export function useUploads(
  deviceId: string,
  folder: string,
  present: ReadonlySet<string>,
): Uploads {
  const client = useQueryClient();
  const [queue] = useState(
    () =>
      new UploadQueue(
        (chunk) => api().call(E.uploadComputerFile, { params: { deviceId }, body: chunk }),
        () => {
          background(
            client.invalidateQueries({ queryKey: ['window', 'computer-files', deviceId] }),
            'queries.invalidate_failed',
          );
        },
      ),
  );
  const [open, setOpen] = useState(false);
  const add = (files: readonly PickedFile[]): void => {
    if (files.length === 0) return;
    queue.add(files, folder, present);
    setOpen(true);
  };
  const choose = async (): Promise<void> => {
    try {
      add(await pickFiles('files'));
    } catch (error) {
      notify({ message: 'Files couldn’t be chosen', error, tone: 'critical' });
    }
  };
  return {
    queue,
    open,
    setOpen,
    add,
    pick: (): void => {
      background(choose(), 'files.pick_failed');
    },
  };
}
