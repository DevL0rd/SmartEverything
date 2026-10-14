import type { ReactNode } from 'react';
import type { CameraRow } from '@smarteverything/domain';
import { changeCamera } from '../../../api/media';
import { SwitchRow } from '../../../components/rows';
import { notify } from '../../../components/toast-store';
import { useIsOwner } from '../../../store/selectors';
import { useTranscriptActions, useTranscriptStatus } from '../data/use-transcripts';
import { listeningDetail, listeningLabel } from './transcript-model';

export function TranscribeRow({ camera }: { readonly camera: CameraRow }): ReactNode {
  const owner = useIsOwner();
  const status = useTranscriptStatus(camera.device_id);
  const actions = useTranscriptActions();
  const listening = status.data?.cameras.find((one) => one.camera_id === camera.device_id);
  const detail = camera.transcribe && listening !== undefined ? listeningDetail(listening) : null;
  const label = listening === undefined ? null : listeningLabel(listening);
  return (
    <SwitchRow
      title="Transcribe what it hears"
      icon="fileText"
      value={camera.transcribe}
      disabled={!owner && !camera.transcribe}
      {...(label === null ? {} : { subtitle: detail === null ? label : `${label} · ${detail}` })}
      onChange={(transcribe) => {
        changeCamera(camera.device_id, { transcribe })
          .then(actions.refreshStatus)
          .catch((error: unknown) => {
            notify({ message: 'Transcribing wasn’t changed', error, tone: 'critical' });
          });
      }}
    />
  );
}
