import type { ReactNode } from 'react';
import type { PluginRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { appPlatform } from '../../../design/platform';
import { useFirewall } from '../../../store/selectors';

export function PluginFirewallBanner({ row }: { readonly row: PluginRow }): ReactNode {
  const firewall = useFirewall();
  if (!row.enabled || firewall === null) return null;
  const openings = firewall.openings.filter(
    (opening) => opening.pluginIds.includes(row.id) && opening.state !== 'open',
  );
  if (openings.length === 0) return null;
  const missing = openings.some((opening) => opening.state !== 'unknown');
  const desktop = appPlatform() === 'desktop';
  return (
    <Banner
      tone="warning"
      title={missing ? 'Firewall access is missing' : 'Firewall access needs checking'}
      body={
        desktop
          ? `${row.manifest.name} needs local network access for discovery and device updates. Review the firewall openings.`
          : `Open SmartEverything on the server computer to review ${row.manifest.name}’s firewall openings for discovery and device updates.`
      }
      wrapBody
      action={{ label: 'View firewall', href: href.settings.page('server/firewall') }}
    />
  );
}
