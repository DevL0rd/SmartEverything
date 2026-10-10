import type { ReactNode } from 'react';
import type { PhoneNodeStatus } from '../../../modules/health-connect';
import { ListRow } from '../../components/list-row';
import { allowWifiName, changeHomeWifi } from './phone-permissions';

export function HomeWifiRow({ status }: { readonly status: PhoneNodeStatus }): ReactNode {
  const { homeWifi, currentWifi } = status;
  if (!status.permissions.location) {
    return (
      <ListRow
        title="Home Wi-Fi"
        subtitle="Android needs location access to read the Wi-Fi name. It stays on this phone."
        icon="wifi"
        chevron
        onPress={() => void allowWifiName()}
      />
    );
  }
  if (homeWifi !== null) {
    return (
      <>
        <ListRow
          title="Home Wi-Fi"
          value={homeWifi}
          subtitle="You’re home whenever this phone is on it"
          icon="wifi"
        />
        <ListRow
          title="Forget home Wi-Fi"
          icon="trash"
          destructive
          onPress={() => void changeHomeWifi(false)}
        />
      </>
    );
  }
  return (
    <ListRow
      title="Home Wi-Fi"
      subtitle={
        currentWifi === null
          ? 'Connect to your home Wi-Fi, then come back here'
          : `Use ${currentWifi} as your home Wi-Fi`
      }
      icon="wifi"
      chevron={currentWifi !== null}
      disabled={currentWifi === null}
      onPress={() => void changeHomeWifi(true)}
    />
  );
}
