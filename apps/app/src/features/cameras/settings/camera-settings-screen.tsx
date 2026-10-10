import type { ReactNode } from 'react';
import {
  WAKE_SENSITIVITIES,
  WAKE_SENSITIVITY_HINTS,
  WAKE_SENSITIVITY_LABELS,
  type CameraChange,
  type CameraRow,
  type WakeSensitivity,
} from '@smarteverything/domain';
import { changeCamera } from '../../../api/media';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader } from '../../../components/page-header';
import { SelectRow, SwitchRow } from '../../../components/rows';
import type { SelectOption } from '../../../components/select';
import { Screen } from '../../../components/screen';
import { List } from '../../../components/section';
import { notify } from '../../../components/toast-store';
import { useIsOwner } from '../../../store/selectors';
import { CapabilityRow, offlineReason } from '../../devices';
import { PrivacyRow, hasPrivacySwitch } from '../components/privacy-row';
import { useCameraEntry } from '../data/use-cameras';
import { useTranscriptActions, useTranscriptStatus } from '../data/use-transcripts';
import { listeningDetail } from '../transcripts/transcript-model';
import type { CameraEntry } from '../logic/cameras';
import { cameraSections } from './camera-groups';
import { DeviceSettingsFrame } from '../../devices';

const SENSITIVITY_OPTIONS: readonly SelectOption<WakeSensitivity>[] = WAKE_SENSITIVITIES.map(
  (sensitivity) => ({
    value: sensitivity,
    label: WAKE_SENSITIVITY_LABELS[sensitivity],
    description: WAKE_SENSITIVITY_HINTS[sensitivity],
  }),
);

function change(deviceId: string, update: CameraChange, failure: string): void {
  changeCamera(deviceId, update).catch((error: unknown) => {
    notify({ message: failure, error, tone: 'critical' });
  });
}

function TranscribeRow({ camera }: { readonly camera: CameraRow }): ReactNode {
  const owner = useIsOwner();
  const status = useTranscriptStatus();
  const actions = useTranscriptActions();
  const listening = status.data?.cameras.find((one) => one.camera_id === camera.device_id);
  const detail = camera.transcribe && listening !== undefined ? listeningDetail(listening) : null;
  return (
    <SwitchRow
      title="Transcribe what it hears"
      icon="fileText"
      value={camera.transcribe}
      disabled={!owner && !camera.transcribe}
      {...(detail === null ? {} : { subtitle: detail })}
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

function CameraRows({ entry }: { readonly entry: CameraEntry }): ReactNode {
  const camera = entry.camera;
  if (camera === null) {
    return null;
  }
  return (
    <>
      <List footer="A snapshot and a short clip of each ring, person, pet, motion, sound and alarm are kept on your server.">
        <SwitchRow
          title="Save event clips"
          icon="film"
          value={camera.record_events}
          onChange={(record) => {
            change(camera.device_id, { record_events: record }, 'Save event clips wasn’t changed');
          }}
        />
      </List>
      <List footer="Raise it if this camera’s microphone is quiet or far from where people talk. Higher hears fainter calls but may wake on similar words.">
        <SelectRow
          title="Wake sensitivity"
          icon="mic"
          options={SENSITIVITY_OPTIONS}
          value={camera.wake_sensitivity}
          onChange={(sensitivity) => {
            change(
              camera.device_id,
              { wake_sensitivity: sensitivity },
              'Wake sensitivity wasn’t changed',
            );
          }}
        />
      </List>
      <List footer="Turns what this camera hears into text that only you can read, kept for the time you choose on the Transcripts page. The sound itself is never saved. It pauses in privacy mode, when the camera is offline and once the day’s budget is used.">
        <TranscribeRow camera={camera} />
      </List>
    </>
  );
}

function CapabilitySections({ entry }: { readonly entry: CameraEntry }): ReactNode {
  const reason = entry.device.online ? null : offlineReason(entry.name);
  return cameraSections(entry.device).map((section) => (
    <List
      key={section.title}
      title={section.title}
      {...(reason === null ? {} : { footer: 'You can change these when it’s back online.' })}
    >
      {section.capabilities.map((presented) => (
        <CapabilityRow
          key={presented.key}
          device={entry.device}
          presented={presented}
          reason={reason}
        />
      ))}
    </List>
  ));
}

function CameraSettings({ entry }: { readonly entry: CameraEntry }): ReactNode {
  return (
    <DeviceSettingsFrame deviceId={entry.device.id} name={entry.name} title="Camera options">
      <CameraRows entry={entry} />
      {hasPrivacySwitch(entry) ? (
        <List>
          <PrivacyRow entry={entry} />
        </List>
      ) : null}
      <CapabilitySections entry={entry} />
    </DeviceSettingsFrame>
  );
}

export function CameraSettingsScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const entry = useCameraEntry(deviceId);
  if (entry === null) {
    return (
      <Screen header={<PageHeader title="Camera" />} maxWidth="reading">
        <EmptyState
          icon="cameraOff"
          title="Camera not found"
          body="It may have been removed or hidden."
        />
      </Screen>
    );
  }
  return <CameraSettings entry={entry} />;
}
