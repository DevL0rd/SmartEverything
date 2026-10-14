import type { ShellyOperationResult } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { List } from '../../components/section';
import { ValueRow } from '../../components/rows';
import { CopyField } from '../../components/copy-field';
import { View } from 'react-native';

export function NetworkResult({ result }: { readonly result: ShellyOperationResult }): ReactNode {
  if (result.kind === 'cloud_relay_list' || result.kind === 'cloud_relay_infos')
    return <CloudRelayResult result={result} />;
  if (result.kind === 'wifi_scan')
    return (
      <List title="Nearby networks">
        {result.value.results.map((network) => (
          <ValueRow
            key={network.bssid}
            title={network.ssid ?? 'Hidden network'}
            value={`${String(network.rssi)} dBm · channel ${String(network.channel)}`}
          />
        ))}
      </List>
    );
  if (result.kind === 'wifi_clients')
    return (
      <List title="Access point clients">
        {result.value.ap_clients.map((client) => (
          <ValueRow key={client.mac} title={client.mac} value={client.ip} />
        ))}
      </List>
    );
  if (result.kind === 'ble_clients')
    return (
      <List title="Paired Bluetooth clients">
        {result.value.map((client) => (
          <ValueRow
            key={client.addr}
            title={client.addr}
            value={`Last active ${new Date(client.atime * 1000).toLocaleString()}`}
          />
        ))}
      </List>
    );
  if (result.kind === 'matter_setup')
    return (
      <View className="gap-3">
        <CopyField label="Matter pairing code" value={result.value.manual_code} />
        <CopyField label="Matter QR payload" value={result.value.qr_code} />
      </View>
    );
  return null;
}

function CloudRelayResult({ result }: { readonly result: ShellyOperationResult }): ReactNode {
  if (result.kind === 'cloud_relay_list')
    return (
      <List title="Cloud relay devices">
        {result.value.addrs.map((addr) => (
          <ValueRow key={addr} title={addr} value="Registered" />
        ))}
      </List>
    );
  if (result.kind === 'cloud_relay_infos')
    return (
      <List title="Cloud relay details">
        {result.value.devices.flatMap((entry) =>
          Object.entries(entry).map(([addr, info]) => (
            <ValueRow
              key={addr}
              title={info.name ?? addr}
              value={`${addr} · model ${String(info.model)} · ${new Date(info.last_seen * 1000).toLocaleString()}`}
            />
          )),
        )}
      </List>
    );
  return null;
}
