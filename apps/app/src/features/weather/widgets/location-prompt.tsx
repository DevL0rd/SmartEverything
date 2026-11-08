import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { ActionBand } from '../../../components/widget-board';
import { LOCATION_HREF } from '../components/weather-notice';

export function LocationPrompt({ canSet }: { readonly canSet: boolean }): ReactNode {
  return (
    <View className="flex-1 gap-2">
      <IconWell icon="mapPin" colour="info" size="m" />
      {canSet ? (
        <ActionBand>
          <Button label="Set location" href={LOCATION_HREF} variant="tonal" />
        </ActionBand>
      ) : (
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          The home’s owner sets its location.
        </Text>
      )}
    </View>
  );
}
