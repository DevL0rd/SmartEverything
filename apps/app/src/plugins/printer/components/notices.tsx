import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { useIsOwner } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { usePrinterActor, usePrinterView } from '../data/use-printer-view';

export function Notices({ device }: { readonly device: Device }): ReactNode {
  const owner = useIsOwner();
  const actor = usePrinterActor(device);
  const settings = usePrinterView(device, 'settings', {}, owner);
  const data = settings.data;
  if (!owner || data === undefined) return null;
  const change = data.certificateChange;
  return (
    <View className="gap-2">
      {change === null ? null : (
        <Banner
          tone="critical"
          title="The printer's certificate changed"
          body="Check that this is still your printer before trusting the new certificate."
          wrapBody
          action={{
            label: 'Trust new certificate',
            onPress: (): void => {
              actor.fire(
                {
                  action: 'trust_certificate',
                  printer: device.external_id,
                  fingerprint: change.presented,
                },
                'Could not trust the certificate',
              );
            },
          }}
        />
      )}
      {data.needsAuth ? (
        <Banner
          tone="warning"
          title="The printer wants a sign-in"
          body="Open the printer settings and enter its user name and password."
          wrapBody
        />
      ) : null}
    </View>
  );
}
