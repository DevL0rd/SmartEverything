import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { FirewallStatus } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { checkFirewall } from '../../../api/firewall';
import { Banner } from '../../../components/banner';
import { EmptyState } from '../../../components/empty-state';
import { ActionRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { moment } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { useFirewall, useIsOwner, useSettings, useSyncStatus } from '../../../store/selectors';
import { useEntityStore } from '../../../store/store-context';
import { BACKEND_LABELS, needsFix } from '../model/firewall';
import { SettingsFrame } from '../../../settings/settings-frame';
import { FirewallLists } from './firewall-lists';
import { useMutationState } from '../../../store/mutation';
import { SERVER_PANEL, ServerPanels } from './server-panels';

function FixBanner({ firewall }: { readonly firewall: FirewallStatus }): ReactNode {
  const owner = useIsOwner();
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
  return owner ? (
    <Banner
      tone="warning"
      title="Some openings are missing"
      action={{ label: 'Review & fix', href: href.firewallFix() }}
    />
  ) : (
    <Banner
      tone="warning"
      title="Some openings are missing"
      body="Ask the owner of this home to fix it."
    />
  );
}

function StatusRows({ firewall }: { readonly firewall: FirewallStatus }): ReactNode {
  const store = useEntityStore();
  const owner = useIsOwner();
  const timeZone = useSettings().time_zone;
  const checked = useMinuteOf((now) => moment(firewall.checkedAt, now, timeZone));
  const check = useMutationState();
  return (
    <List inset footer={firewall.detail}>
      <ValueRow icon="shield" title="Firewall" value={BACKEND_LABELS[firewall.backend]} />
      {firewall.filtering === null ? null : (
        <ValueRow icon="filter" title="Filtering" value={firewall.filtering ? 'On' : 'Off'} />
      )}
      <ValueRow icon="clock" title="Checked" value={checked} />
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
  const unreadable = useSyncStatus().outdated.includes('firewall');
  return (
    <SettingsFrame page="server/firewall" contentWidth="full">
      {firewall === null && unreadable ? (
        <EmptyState
          icon="shield"
          title="This part could not be read"
          body="Your server sends firewall details this app does not understand. Update the app."
          compact
        />
      ) : firewall === null ? (
        <EmptyState
          icon="shield"
          title="Not checked yet"
          body="Your server checks its firewall when it starts."
          compact
        />
      ) : (
        <ServerPanels>
          <View className={`${SERVER_PANEL} gap-section-gap`}>
            <FixBanner firewall={firewall} />
            <StatusRows firewall={firewall} />
          </View>
          <FirewallLists firewall={firewall} />
        </ServerPanels>
      )}
    </SettingsFrame>
  );
}
