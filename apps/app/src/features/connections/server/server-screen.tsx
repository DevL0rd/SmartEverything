import type { ReactNode } from 'react';
import { href, UPDATES_SETTINGS_PAGE } from '../../../app-shell/hrefs';
import { ListRow } from '../../../components/list-row';
import { NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useFirewall, useIsOwner } from '../../../store/selectors';
import { firewallSummary } from '../model/firewall';
import { SettingsFrame } from '../../../settings/settings-frame';
import { PublicUrlSection } from './public-url';
import { SERVER_PANEL, ServerPanels } from './server-panels';
import { ThisDeviceSection } from './this-device';

function SubPages(): ReactNode {
  const summary = firewallSummary(useFirewall());
  const owner = useIsOwner();
  return (
    <List inset className={SERVER_PANEL}>
      <ListRow
        icon="shield"
        title="Firewall"
        subtitle={summary.text}
        subtitleTone={summary.critical ? 'critical' : 'variant'}
        href={href.settings.page('server/firewall')}
        chevron
      />
      <NavRow icon="activity" title="Diagnostics" href={href.settings.page('server/diagnostics')} />
      {owner ? (
        <NavRow
          icon="download"
          title="Hub updates"
          subtitle="Check the Git source and recover a hub release."
          href={href.settings.page(UPDATES_SETTINGS_PAGE)}
        />
      ) : null}
    </List>
  );
}

export function ServerScreen(): ReactNode {
  return (
    <SettingsFrame page="server" contentWidth="full">
      <ServerPanels>
        <PublicUrlSection />
        <ThisDeviceSection />
        <SubPages />
      </ServerPanels>
    </SettingsFrame>
  );
}
