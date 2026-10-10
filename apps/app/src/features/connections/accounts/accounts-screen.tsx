import type { ReactNode } from 'react';
import { PROVIDER_INFO } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { RowBrand } from '../row-brand';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { useRows } from '../../../store/selectors';
import { PROVIDER_BRAND } from '../model/brands';
import { isAccount, linkSummary } from '../model/problems';
import { SettingsFrame } from '../../../settings/settings-frame';

const ADD = href.settings.page('connections/add');

function AccountRows(): ReactNode {
  const accounts = useRows('provider_links').filter(isAccount);
  if (accounts.length === 0) {
    return (
      <EmptyState
        icon="link"
        title="No accounts yet"
        body="Link Xiaomi, Smart Life or SmartThings to bring in your devices."
        action={<Button label="Add account" icon="plus" href={ADD} />}
      />
    );
  }
  return (
    <List inset>
      {[
        ...accounts.map((row) => {
          const summary = linkSummary(row);
          return (
            <ListRow
              key={row.provider}
              leading={<RowBrand brand={PROVIDER_BRAND[row.provider]} />}
              title={PROVIDER_INFO[row.provider].name}
              subtitle={summary.text}
              subtitleTone={summary.tone}
              href={href.settings.account(row.provider)}
              chevron
            />
          );
        }),
        <ListRow key="add" icon="plus" iconTone="primary" title="Add account" href={ADD} />,
      ]}
    </List>
  );
}

export function AccountsScreen(): ReactNode {
  return (
    <SettingsFrame page="connections">
      <AccountRows />
    </SettingsFrame>
  );
}
