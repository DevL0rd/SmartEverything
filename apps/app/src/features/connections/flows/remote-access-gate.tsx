import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';

export function RemoteAccessGate({ who }: { readonly who: string }): ReactNode {
  return (
    <View className="items-center gap-3 py-4">
      <Icon name="globe" size={40} tone="primary" />
      <Text variant="title-3" align="center">
        Remote access needed
      </Text>
      <Text variant="callout" tone="variant" align="center">
        {`${who} reaches your server through its public address.`}
      </Text>
      <Button label="Set up remote access" variant="tonal" href={href.settings.page('server')} />
    </View>
  );
}

export function verifiedPublicUrl(settings: {
  readonly public_url: string | null;
  readonly public_url_verified_at: string | null;
}): string | null {
  return settings.public_url_verified_at === null ? null : settings.public_url;
}
