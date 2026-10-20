import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { List } from '../../../components/section';
import { useRow } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { directAddressOf } from './direct-link';
import { directLinkRows } from './direct-link-rows';
import { DirectLinkSheet } from './direct-link-sheet';
import { WakeAddressRow } from './wake-address-row';

export function DirectLinkSection({
  device,
  name,
}: {
  readonly device: Device;
  readonly name: string;
}): ReactNode {
  const settings = useRow('television_settings', device.id);
  const [linking, setLinking] = useState(false);
  if (device.kind !== 'television' || device.provider !== 'smartthings') {
    return null;
  }
  const address = directAddressOf(settings);
  return (
    <>
      <List title="Direct link">
        {directLinkRows(address)}
        <View className="flex-row px-4 py-3">
          <Button
            label={address === null ? 'Link directly' : 'Link again'}
            icon="link"
            variant={address === null ? 'filled' : 'outlined'}
            onPress={() => {
              setLinking(true);
            }}
          />
        </View>
      </List>
      {address === null ? <WakeAddressRow deviceId={device.id} settings={settings} /> : null}
      {linking ? (
        <DirectLinkSheet
          deviceId={device.id}
          name={name}
          onClose={() => {
            setLinking(false);
          }}
        />
      ) : null}
    </>
  );
}
