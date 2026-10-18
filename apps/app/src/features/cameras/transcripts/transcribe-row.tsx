import type { ReactNode } from 'react';
import type { CameraRow } from '@smarteverything/domain';
import { changeCamera } from '../../../api/media';
import { confirm } from '../../../components/confirm-store';
import { SwitchRow } from '../../../components/rows';
import { notifyFailure } from '../../../components/toast-store';
import { useIsOwner } from '../../../store/selectors';
import { useTranscriptActions, useTranscriptStatus } from '../data/use-transcripts';
import { listeningDetail } from './transcript-model';

export function TranscribeRow({ camera }: { readonly camera: CameraRow }): ReactNode {
  const owner = useIsOwner();
  const status = useTranscriptStatus(camera.device_id);
  const actions = useTranscriptActions();
  const listening = status.data?.cameras.find((one) => one.camera_id === camera.device_id);
  const detail = camera.transcribe && listening !== undefined ? listeningDetail(listening) : null;
  const change = async (transcribe: boolean): Promise<void> => {
    if (
      transcribe &&
      !(await confirm({
        title: 'Transcribe what this camera hears?',
        body: 'Anyone who can view this camera can read the text. Audio is never kept.',
        confirmLabel: 'Turn on',
      }))
    )
      return;
    await changeCamera(camera.device_id, { transcribe });
    actions.refreshStatus();
  };
  return (
    <SwitchRow
      title="Transcribe what it hears"
      icon="fileText"
      value={camera.transcribe}
      disabled={!owner && !camera.transcribe}
      {...(detail === null ? {} : { subtitle: detail })}
      onChange={(transcribe) => {
        change(transcribe).catch(notifyFailure('Transcribing wasn’t changed'));
      }}
    />
  );
}
