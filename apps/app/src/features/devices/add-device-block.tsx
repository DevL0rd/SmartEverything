import type { ReactNode } from 'react';
import type { Href } from 'expo-router';
import { ADDABLE_PROVIDERS, PROVIDER_INFO } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { useRows } from '../../store/selectors';
import { PRINTER_PLUGIN } from './printer-plugin';
import { CONNECT_FLOW, PROVIDER_BRAND, RowBrand, isAddable } from '../connections';

const ACCOUNTS = ADDABLE_PROVIDERS.filter(isAddable);

function targetOf(provider: (typeof ACCOUNTS)[number], linked: boolean): Href {
  return linked ? href.settings.account(provider) : href.connect(CONNECT_FLOW[provider]);
}

export function AddDeviceBlock(): ReactNode {
  const links = useRows('provider_links');
  return (
    <List title="Hub plugins" inset footer="Devices in the account appear here by themselves.">
      {[
        ...ACCOUNTS.map((provider) => {
          const linked = links.some(
            (link) => link.provider === provider && link.status === 'linked',
          );
          return (
            <ListRow
              key={provider}
              title={PROVIDER_INFO[provider].name}
              subtitle={linked ? 'Connected · find new devices' : PROVIDER_INFO[provider].summary}
              leading={<RowBrand brand={PROVIDER_BRAND[provider]} />}
              href={targetOf(provider, linked)}
              chevron
            />
          );
        }),
        <ListRow
          key="printer"
          title={PRINTER_PLUGIN.title}
          subtitle={PRINTER_PLUGIN.description}
          wrapSubtitle
          icon={PRINTER_PLUGIN.icon}
          href={href.connect('printer')}
          chevron
        />,
      ]}
    </List>
  );
}
