import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { FirewallStatus } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { checkFirewall } from '../../../api/firewall';
import { Banner } from '../../../components/banner';
import { EmptyState } from '../../../components/empty-state';
import { ActionRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { appPlatform } from '../../../design/platform';
import { moment } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useFirewall, useIsOwner, useSettings } from '../../../store/selectors';
import { useEntityStore } from '../../../store/store-context';
import { BACKEND_LABELS, needsFix } from '../model/firewall';
import { SettingsFrame } from '../../../settings/settings-frame';
import { CamerasList, OpeningsList } from './firewall-lists';
import { useMutationState } from '../../../store/mutation';

function FixBanner({ firewall }: { readonly firewall: FirewallStatus }): ReactNode {
  const missing = needsFix(firewall);
  if (missing.length === 0) {
    return <Banner tone="positive" title="Everything needed is open" />;
  }
  if (firewall.plan === null) {
    return (
      <Banner
        tone="warning"
        title="Add these openings by hand"
        body={`${BACKEND_LABELS[firewall.backend]} can’t be changed from here.`}
      />
    );
  }
  return appPlatform() === 'desktop' ? (
    <Banner
      tone="warning"
      title="Some openings are missing"
      action={{ label: 'Review & fix', href: href.firewallFix() }}
    />
  ) : (
    <Banner tone="warning" title="Some openings are missing" body="Fix it in the desktop app." />
  );
}

function StatusRows({ firewall }: { readonly firewall: FirewallStatus }): ReactNode {
  const store = useEntityStore();
  const owner = useIsOwner();
  const now = useMinute();
  const timeZone = useSettings().time_zone;
  const check = useMutationState();
  return (
    <List inset footer={firewall.detail}>
      <ValueRow icon="shield" title="Firewall" value={BACKEND_LABELS[firewall.backend]} />
      {firewall.filtering === null ? null : (
        <ValueRow icon="filter" title="Filtering" value={firewall.filtering ? 'On' : 'Off'} />
      )}
      <ValueRow icon="clock" title="Checked" value={moment(firewall.checkedAt, now, timeZone)} />
      {owner ? (
        <ActionRow
          icon="refresh"
          title={check.busy ? 'Checking…' : 'Check again'}
          disabled={check.busy}
          onPress={() => {
            check.run(() => checkFirewall(store), { failure: 'The check didn’t run' });
          }}
        />
      ) : null}
    </List>
  );
}

export function FirewallScreen(): ReactNode {
  const firewall = useFirewall();
  return (
    <SettingsFrame page="server/firewall">
      {firewall === null ? (
        <EmptyState
          icon="shield"
          title="Not checked yet"
          body="Your server checks its firewall when it starts."
        />
      ) : (
        <View className="gap-section-gap">
          <FixBanner firewall={firewall} />
          <StatusRows firewall={firewall} />
          <OpeningsList firewall={firewall} />
          <CamerasList firewall={firewall} />
        </View>
      )}
    </SettingsFrame>
  );
}
