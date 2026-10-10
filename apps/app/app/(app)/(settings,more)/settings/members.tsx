import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { href } from '../../../../src/app-shell/hrefs';
import { SettingsPageScreen } from '../../../../src/settings/settings-screen';

export default function MembersRoute(): ReactNode {
  const router = useRouter();
  return (
    <SettingsPageScreen
      page="members"
      primaryAction={{
        label: 'Pair a phone',
        icon: 'qr',
        onPress: () => {
          router.push(href.pairPhone());
        },
      }}
    />
  );
}
