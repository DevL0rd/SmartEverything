import { TextExportButton } from './text-export-button';
import { View } from 'react-native';
import type { ReactNode } from 'react';
import type { ShellyPresenceDevice } from '@smarteverything/domain';
import { ValueRow } from '../../components/rows';
import { List } from '../../components/section';
export function DeviceIdentity({ sensor }: { readonly sensor: ShellyPresenceDevice }): ReactNode {
  const info = sensor.info;
  return (
    <View className="gap-3">
      <List title="Sensor identity">
        <ValueRow title="Model" value={info.model} />
        <ValueRow title="Generation" value={String(info.gen)} />
        <ValueRow title="Device ID" value={info.id} />
        <ValueRow title="Hardware address" value={info.mac} />
        <ValueRow title="Application" value={info.app} />
        <ValueRow title="Firmware" value={info.ver} />
        <ValueRow title="Firmware build" value={info.fw_id} />
        <ValueRow title="Local authentication" value={info.auth_en ? 'Enabled' : 'Disabled'} />
        <ValueRow title="Operating mode" value={info.profile ?? 'Not reported'} />
        <ValueRow title="Provisioning" value={info.provision ?? 'Not reported'} />
        <ValueRow
          title="Configuration revision"
          value={sensor.revision === null ? 'Unknown' : String(sensor.revision)}
        />
      </List>
      <TextExportButton
        name="shelly-presence-info.txt"
        title="Export device information"
        content={[
          `Device: ${info.id}`,
          `Model: ${info.model}`,
          `Generation: ${String(info.gen)}`,
          `Firmware: ${info.ver}`,
          `Build: ${info.fw_id}`,
          `Application: ${info.app}`,
          `Mode: ${info.profile ?? 'Not reported'}`,
        ].join('\n')}
      />
    </View>
  );
}
