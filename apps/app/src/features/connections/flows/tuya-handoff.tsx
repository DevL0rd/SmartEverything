import type { ReactNode } from 'react';
import { View } from 'react-native';
import { usePathname } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { BrandMark } from '../../../components/brand-mark';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { useIsPhone } from '../../../design/size-class';
import { useProviderLink } from '../../../store/selectors';

export function TuyaHandoff(): ReactNode {
  const row = useProviderLink('tuya');
  const pathname = usePathname();
  const phone = useIsPhone();
  if (phone || row?.prompt?.kind !== 'scan_qr' || pathname.startsWith('/connect/tuya')) {
    return null;
  }
  return (
    <View
      pointerEvents="box-none"
      className="absolute bottom-6 right-6 max-w-dialog flex-row items-center gap-3 rounded-lg border-hairline border-outline-variant bg-surface-raised p-card-pad elevation-2"
    >
      <BrandMark brand="tuya" size={40} />
      <View className="min-w-0 flex-1">
        <Text variant="body-strong">Finish Smart Life sign-in</Text>
        <Text variant="callout" tone="variant">
          Scan the code with your phone.
        </Text>
      </View>
      <Button label="Show code" href={href.connect('tuya')} />
    </View>
  );
}
