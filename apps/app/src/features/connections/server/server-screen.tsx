import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { ListRow } from '../../../components/list-row';
import { NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useFirewall } from '../../../store/selectors';
import { firewallSummary } from '../model/firewall';
import { SettingsFrame } from '../../../settings/settings-frame';
import { PublicUrlSection } from './public-url';
import { ThisComputerSection } from './this-computer';
import { ThisDeviceSection } from './this-device';

function SubPages(): ReactNode {
  const summary = firewallSummary(useFirewall());
  return (
    <List inset>
      <ListRow
        icon="shield"
        title="Firewall"
        subtitle={summary.text}
        subtitleTone={summary.critical ? 'critical' : 'variant'}
        href={href.settings.page('server/firewall')}
        chevron
      />
      <NavRow icon="activity" title="Diagnostics" href={href.settings.page('server/diagnostics')} />
    </List>
  );
}

export function ServerScreen(): ReactNode {
  return (
    <SettingsFrame page="server">
      <PublicUrlSection />
      <ThisDeviceSection />
      <ThisComputerSection />
      <SubPages />
    </SettingsFrame>
  );
}
