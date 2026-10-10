import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  PROVIDER,
  PROVIDER_INFO,
  type Provider,
  type ProviderLinkRow,
} from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { BrandMark } from '../../../components/brand-mark';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { Text } from '../../../components/text';
import { useProviderLink } from '../../../store/selectors';
import { CONNECT_FLOW, PROVIDER_BRAND, isAddable } from '../model/brands';
import { linkSummary, problemTitle } from '../model/problems';
import { SettingsFrame } from '../../../settings/settings-frame';
import { AccountRows } from './account-rows';

function Header({
  provider,
  row,
}: {
  readonly provider: Provider;
  readonly row: ProviderLinkRow | null;
}): ReactNode {
  const info = PROVIDER_INFO[provider];
  const summary = row?.status === 'linked' ? linkSummary(row) : null;
  return (
    <View className="flex-row items-center gap-4 px-1">
      <BrandMark brand={PROVIDER_BRAND[provider]} size={40} />
      <Text variant="body" tone={summary?.tone ?? 'variant'} className="min-w-0 flex-1">
        {summary?.text ?? row?.account_label ?? info.summary}
      </Text>
    </View>
  );
}

function StatusBanner({
  provider,
  row,
}: {
  readonly provider: Provider;
  readonly row: ProviderLinkRow;
}): ReactNode {
  if (!isAddable(provider)) {
    return null;
  }
  const flow = href.connect(CONNECT_FLOW[provider]);
  if (row.status === 'linking') {
    return (
      <Banner tone="info" title="Sign-in in progress" action={{ label: 'Open', href: flow }} />
    );
  }
  if (row.status === 'needs_attention') {
    return (
      <Banner
        tone="critical"
        title={problemTitle(provider, row.problem ?? 'unknown')}
        action={{ label: 'Fix', href: flow }}
      />
    );
  }
  return null;
}

function NotConnected({ provider }: { readonly provider: Provider }): ReactNode {
  return (
    <EmptyState
      icon="link"
      title="Not connected"
      body={PROVIDER_INFO[provider].summary}
      {...(isAddable(provider)
        ? { action: <Button label="Connect" href={href.connect(CONNECT_FLOW[provider])} /> }
        : {})}
    />
  );
}

function Account({ provider }: { readonly provider: Provider }): ReactNode {
  const row = useProviderLink(provider);
  return (
    <SettingsFrame page="connections" title={PROVIDER_INFO[provider].name} detail>
      <Header provider={provider} row={row} />
      {row === null || row.status === 'unlinked' ? (
        <NotConnected provider={provider} />
      ) : (
        <>
          <StatusBanner provider={provider} row={row} />
          <AccountRows row={row} />
        </>
      )}
    </SettingsFrame>
  );
}

export function AccountScreen(): ReactNode {
  const { provider } = useLocalSearchParams<{ provider: string }>();
  const parsed = PROVIDER.safeParse(provider);
  if (!parsed.success) {
    return (
      <SettingsFrame page="connections" title="Account" detail>
        <EmptyState icon="link" title="Account not found" body="This account doesn’t exist." />
      </SettingsFrame>
    );
  }
  return <Account provider={parsed.data} />;
}
