import { BluetoothObservation } from './bluetooth-observation';
import { Fragment, type ReactNode } from 'react';
import { inTier, isCamera } from '@smarteverything/domain';
import { NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { href } from '../../../app-shell/hrefs';
import { useDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { CapabilityRow } from '../controls/capability-row';
import { offlineReason } from '../controls/guard';
import { MissingDevice } from '../detail/missing-device';
import { pluginSettingsBlocksOf } from '../detail/plugin-sections';
import { settingsOf } from '../model/control-groups';
import { useDisplayName } from '../model/display-name';
import { useDeviceModel } from '../model/device-model';
import { AboutSection } from './about-section';
import { DeviceSettingsFrame } from './settings-frame';
import { GeneralSection } from './general-section';
import { RemoveSection } from './remove-section';
import { ScaleStatus } from '../../profiles';

const IR_KINDS: ReadonlySet<Device['kind']> = new Set(['ir_blaster']);

function OptionsSection({
  device,
  reason,
}: {
  readonly device: Device;
  readonly reason: string | null;
}): ReactNode {
  const model = useDeviceModel(device);
  const options = settingsOf(model.presentation);
  if (options.length === 0) {
    return null;
  }
  return (
    <List
      title="Device options"
      {...(reason === null ? {} : { footer: 'You can change these when it is back online.' })}
    >
      {options.map((presented) => (
        <CapabilityRow key={presented.key} device={device} presented={presented} reason={reason} />
      ))}
    </List>
  );
}

function MaintenanceSection({
  device,
  reason,
}: {
  readonly device: Device;
  readonly reason: string | null;
}): ReactNode {
  const model = useDeviceModel(device);
  const actions = inTier(model.presentation, 'maintenance').filter(
    (presented) => presented.writable && presented.capability.value.kind === 'action',
  );
  if (actions.length === 0) {
    return null;
  }
  return (
    <List title="Maintenance">
      {actions.map((presented) => (
        <CapabilityRow key={presented.key} device={device} presented={presented} reason={reason} />
      ))}
    </List>
  );
}

function BluetoothSection({ device }: { readonly device: Device }): ReactNode {
  return device.provider === 'xiaomi' && device.model === 'isa.magnet.dw2hl' ? (
    <BluetoothObservation device={device} />
  ) : null;
}

function Body({
  device,
  children,
}: {
  readonly device: Device;
  readonly children?: ReactNode;
}): ReactNode {
  const name = useDisplayName(device.id);
  const scale = useDeviceModel(device).family === 'scale';
  const reason = device.online ? null : offlineReason(name);
  return (
    <DeviceSettingsFrame deviceId={device.id} name={name} title={name}>
      <GeneralSection device={device} name={name} />
      {isCamera(device) ? (
        <List>
          <NavRow
            title="Camera options"
            subtitle="Event clips, wake sensitivity, transcripts, picture, detection, speaker and memory card"
            icon="cameras"
            href={href.settings.camera(device.id)}
          />
        </List>
      ) : (
        <>
          <OptionsSection device={device} reason={reason} />
          <MaintenanceSection device={device} reason={reason} />
        </>
      )}
      {IR_KINDS.has(device.kind) ? (
        <List title="Remotes">
          <NavRow
            title="Remotes"
            subtitle="Add remotes and learn their buttons"
            icon="remote"
            href={href.settings.device(device.id, 'remotes')}
          />
        </List>
      ) : null}
      <BluetoothSection device={device} />
      {scale ? <ScaleStatus scale={device} /> : null}
      {pluginSettingsBlocksOf(device).map((block) => (
        <Fragment key={block.key}>{block.render(device)}</Fragment>
      ))}
      {children}
      <AboutSection device={device} />
      <RemoveSection device={device} name={name} />
    </DeviceSettingsFrame>
  );
}

export function DeviceSettingsScreen({
  deviceId,
  children,
}: {
  readonly deviceId: string;
  readonly children?: ReactNode;
}): ReactNode {
  const device = useDevice(deviceId);
  return device === null ? <MissingDevice /> : <Body device={device}>{children}</Body>;
}
