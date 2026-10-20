import type { ReactNode } from 'react';
import type { PluginRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { useFirewall, useIsOwner } from '../../../store/selectors';

export function PluginFirewallBanner({ row }: { readonly row: PluginRow }): ReactNode {
  const firewall = useFirewall();
  const owner = useIsOwner();
  if (!row.enabled || firewall === null) return null;
  const openings = firewall.openings.filter(
    (opening) => opening.pluginIds.includes(row.id) && opening.state !== 'open',
  );
  if (openings.length === 0) return null;
  const missing = openings.some((opening) => opening.state !== 'unknown');
  return (
    <Banner
      tone="warning"
      title={missing ? 'Firewall access is missing' : 'Firewall access needs checking'}
      body={
        owner
          ? `${row.manifest.name} needs local network access for discovery and device updates. Review the firewall openings.`
          : `Ask the owner of this home to allow ${row.manifest.name} through the firewall.`
      }
      wrapBody
      action={{ label: 'View firewall', href: href.settings.page('server/firewall') }}
    />
  );
}
