import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { LOCATION_HREF } from '../components/weather-notice';

export function LocationPrompt({ canSet }: { readonly canSet: boolean }): ReactNode {
  return (
    <View className="flex-1 justify-end gap-2">
      <IconWell icon="mapPin" colour="info" size="m" />
      {canSet ? (
        <View className="flex-row">
          <Button label="Set location" icon="mapPin" href={LOCATION_HREF} />
        </View>
      ) : (
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          The home’s owner sets its location.
        </Text>
      )}
    </View>
  );
}
