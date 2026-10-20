import type { ReactNode } from 'react';
import { Linking, View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { SwitchTrack } from '../../../components/switch';
import { Text } from '../../../components/text';
import { locationRequired } from '../data/bluetooth-permission';

const LOCATION_SETTINGS = 'android.settings.LOCATION_SOURCE_SETTINGS';

const PRIVACY_LINE =
  'Brushing data goes only to your own server. Nothing is sent to Philips, and SmartEverything never logs in to a Philips account.';

export function CheckStep({
  closed,
  onToggle,
}: {
  readonly closed: boolean;
  readonly onToggle: (value: boolean) => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        The brush talks to one app at a time. If the Philips Sonicare app is open anywhere, it keeps
        the link and the next steps fail. This setup only reads from the brush and changes nothing
        on it.
      </Text>
      <List inset>
        <ListRow
          icon="smartphone"
          title="The Philips Sonicare app is closed on every phone"
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

export function PermissionStep({
  denied,
  onAllow,
}: {
  readonly denied: boolean;
  readonly onAllow: () => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <EmptyState
        icon="bluetooth"
        title="Allow nearby devices"
        body="SmartEverything needs this to find the brush and to talk to it over Bluetooth."
      />
      {locationRequired() ? (
        <Banner
          tone="info"
          title="Location must be on"
          body="Android 11 and older only finds Bluetooth devices while location is turned on. Your location is not used or stored."
          wrapBody
          action={{
            label: 'Turn on',
            onPress: (): void => {
              background(Linking.sendIntent(LOCATION_SETTINGS), 'settings.open_failed');
            },
          }}
        />
      ) : null}
      {denied ? (
        <Banner
          tone="warning"
          title="Nearby devices is turned off"
          body="Allow it in the app settings, then come back."
          wrapBody
          action={{
            label: 'Open settings',
            onPress: (): void => {
              background(Linking.openSettings(), 'settings.open_failed');
            },
          }}
        />
      ) : null}
      <Button label="Allow nearby devices" size="lg" onPress={onAllow} />
    </View>
  );
}
