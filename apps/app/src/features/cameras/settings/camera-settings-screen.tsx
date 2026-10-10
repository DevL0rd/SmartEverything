import type { ReactNode } from 'react';
import { setRecordEvents } from '../../../api/media';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader } from '../../../components/page-header';
import { SwitchRow } from '../../../components/rows';
import { Screen } from '../../../components/screen';
import { List } from '../../../components/section';
import { notify } from '../../../components/toast-store';
import { CapabilityRow, offlineReason } from '../../devices';
import { PrivacyRow, hasPrivacySwitch } from '../components/privacy-row';
import { useCameraEntry } from '../data/use-cameras';
import type { CameraEntry } from '../logic/cameras';
import { cameraSections } from './camera-groups';
import { DeviceSettingsFrame } from '../../devices';

function ClipsRow({ entry }: { readonly entry: CameraEntry }): ReactNode {
  const camera = entry.camera;
  if (camera === null) {
    return null;
  }
  return (
    <List footer="A snapshot and a short clip of each ring, person, pet, motion, sound and alarm are kept on your server.">
      <SwitchRow
        title="Save event clips"
        icon="film"
        value={camera.record_events}
        onChange={(record) => {
          setRecordEvents(camera.device_id, record).catch((error: unknown) => {
            notify({
              message: 'Save event clips wasn’t changed',
              error,
              tone: 'critical',
            });
          });
        }}
      />
    </List>
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
      <ClipsRow entry={entry} />
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
