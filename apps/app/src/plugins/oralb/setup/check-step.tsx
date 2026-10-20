import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { SwitchTrack } from '../../../components/switch';
import { Text } from '../../../components/text';
import { Banner } from '../../../components/banner';

export const APP_NOTICE =
  'The Oral-B app and this app cannot hold the brush at the same time. Close the Oral-B app while setting up. After setup, either can be used, one at a time.';

export const PRIVACY_LINE =
  'Brushing data goes only to your own server. Nothing is sent to Oral-B or Procter & Gamble, and SmartEverything never logs in to an Oral-B account.';

export function OralbCheckStep({
  closed,
  onToggle,
}: {
  readonly closed: boolean;
  readonly onToggle: (value: boolean) => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <Banner tone="info" title="Close the Oral-B app" body={APP_NOTICE} wrapBody />
      <Text variant="callout" tone="variant">
        This setup only reads from the brush. Nothing is written to it.
      </Text>
      <List inset>
        <ListRow
          icon="smartphone"
          title="The Oral-B app is closed on every phone"
          subtitle="Swipe it away so it cannot reconnect"
          wrapSubtitle
          role="checkbox"
          checked={closed}
          onPress={() => {
            onToggle(!closed);
          }}
          trailing={<SwitchTrack value={closed} mixed={false} />}
        />
      </List>
      <Text variant="footnote" tone="faint">
        {PRIVACY_LINE}
      </Text>
    </View>
  );
}
