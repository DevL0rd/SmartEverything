import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { copyText } from '../../../components/copy-button';
import { CopyField } from '../../../components/copy-field';
import { ListRow } from '../../../components/list-row';
import { ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useDevice, useDeviceValues } from '../../../store/selectors';
import type { Device, DeviceValues } from '../../../store/state';
import { MissingDevice } from '../detail/missing-device';
import { detailTextOf } from '../model/connection';
import { useDisplayName } from '../model/display-name';
import { shownValue, useDeviceModel } from '../model/device-model';
import { DeviceSettingsFrame } from './settings-frame';

function diagnosticsText(device: Device, values: DeviceValues): string {
  return JSON.stringify({ device, values }, null, 2);
}

function Identity({ device }: { readonly device: Device }): ReactNode {
  const detail = detailTextOf(device);
  return (
    <View className="gap-section-gap">
      <View className="gap-3">
        <CopyField label="Device id" value={device.id} />
        <CopyField label="Provider id" value={device.external_id} />
        <CopyField label="Model id" value={device.model} />
      </View>
      <List title="Connection">
        {detail === null ? (
          <ListRow
            title="The connection details could not be read"
            icon="warning"
            iconTone="warning"
          />
        ) : null}
        {detail?.transportReason === undefined ? null : (
          <ListRow title="How it connects" subtitle={detail.transportReason} />
        )}
        {detail?.updates === undefined ? null : (
          <ListRow title="How it updates" subtitle={detail.updates} />
        )}
        {detail?.ip === undefined || detail.ip === null ? null : (
          <ValueRow title="Address" value={detail.ip} />
        )}
      </List>
    </View>
  );
}

function Capabilities({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  const values = useDeviceValues(device.id);
  return (
    <List title={`Capabilities (${String(model.presentation.capabilities.length)})`}>
      {model.presentation.capabilities.map((presented) => (
        <ListRow
          key={presented.key}
          title={presented.label}
          subtitle={`${presented.key} · ${presented.tier}`}
          value={shownValue(presented, values[presented.key]?.value)}
        />
      ))}
    </List>
  );
}

function Body({ device }: { readonly device: Device }): ReactNode {
  const name = useDisplayName(device.id);
  const values = useDeviceValues(device.id);
  return (
    <DeviceSettingsFrame deviceId={device.id} name={name} title="Diagnostics">
      <Identity device={device} />
      <Capabilities device={device} />
      <View className="flex-row">
        <Button
          label="Copy diagnostics"
          icon="copy"
          variant="tonal"
          onPress={() => {
            copyText(diagnosticsText(device, values), 'Diagnostics');
          }}
        />
      </View>
    </DeviceSettingsFrame>
  );
}

export function DeviceDiagnosticsScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const device = useDevice(deviceId);
  return device === null ? <MissingDevice /> : <Body device={device} />;
}
