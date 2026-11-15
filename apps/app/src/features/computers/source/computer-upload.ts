import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { base64Of } from '../../../format/base64';
import { rawErrorText } from '../../../format/errors';
import type { UploadHandle, UploadJob, UploadOutcome, UploadTransport } from '../../files';
import { chunkOf, joinPath, piecesOf } from './computer-path';
import { pathOfLocation } from './computer-ops';

interface Control {
  cancelled: boolean;
  gate: Promise<void> | null;
  release: (() => void) | null;
}

async function send(
  deviceId: string,
  job: UploadJob,
  control: Control,
  progress: (sent: number) => void,
): Promise<UploadOutcome> {
  try {
    const data = await job.file.data();
    const path = joinPath(pathOfLocation(job.folder), job.name);
    for (const piece of piecesOf(data.byteLength)) {
      while (control.gate !== null) await control.gate;
      if (control.cancelled) return { kind: 'cancelled' };
      await api().call(E.uploadComputerFile, {
        params: { deviceId },
        body: chunkOf(path, piece, base64Of(data, piece.start, piece.end), job.replace),
      });
      progress(piece.end);
    }
    return { kind: 'done', name: job.name, renamed: false };
  } catch (error) {
    return { kind: 'failed', text: rawErrorText(error), retryable: true };
  }
}

export function computerUpload(deviceId: string, onDone: () => void): UploadTransport {
  return {
    conflicts: 'ask',
    serial: true,
    start: (job, progress): UploadHandle => {
      const control: Control = { cancelled: false, gate: null, release: null };
      const outcome = send(deviceId, job, control, progress).then((result) => {
        if (result.kind === 'done') onDone();
        return result;
      });
      return {
        outcome,
        pause: (): Promise<void> => {
          control.gate ??= new Promise<void>((resolve) => {
            control.release = resolve;
          });
          return Promise.resolve();
        },
        resume: (): void => {
          control.release?.();
          control.release = null;
          control.gate = null;
        },
        cancel: (): Promise<void> => {
          control.cancelled = true;
          control.release?.();
          control.release = null;
          control.gate = null;
          return Promise.resolve();
        },
      };
    },
  };
}
