import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { ADDABLE_PROVIDERS, PROVIDER_INFO, type Provider } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { BrandMark } from '../../../components/brand-mark';
import { Card } from '../../../components/card';
import { Grid } from '../../../components/grid';
import { SearchField } from '../../../components/search-field';
import { Text } from '../../../components/text';
import { useProviderLink } from '../../../store/selectors';
import { CONNECT_FLOW, PROVIDER_BRAND, isAddable } from '../model/brands';
import { SettingsFrame } from '../../../settings/settings-frame';

function matches(provider: Provider, query: string): boolean {
  const info = PROVIDER_INFO[provider];
  const needle = query.trim().toLowerCase();
  return [info.name, info.brand, info.summary].some((text) => text.toLowerCase().includes(needle));
}

function ProviderCard({ provider }: { readonly provider: Provider }): ReactNode {
  const row = useProviderLink(provider);
  const info = PROVIDER_INFO[provider];
  const connected = row !== null && row.status !== 'unlinked';
  const target =
    connected || !isAddable(provider)
      ? href.settings.account(provider)
      : href.connect(CONNECT_FLOW[provider]);
  return (
    <Card href={target} label={`${info.name}, ${info.summary}`}>
      <View className="flex-row items-start gap-3">
        <BrandMark brand={PROVIDER_BRAND[provider]} size={40} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="title-3" numberOfLines={1}>
            {info.name}
          </Text>
          <Text variant="callout" tone="variant" numberOfLines={2}>
            {info.summary}
          </Text>
        </View>
        {connected ? <Badge label="Connected" tone="positive" /> : null}
      </View>
    </Card>
  );
}

export function AddAccountScreen(): ReactNode {
  const [query, setQuery] = useState('');
  const shown = ADDABLE_PROVIDERS.filter((provider) => matches(provider, query));
  return (
    <SettingsFrame page="connections/add">
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search accounts"
        variant="field"
      />
      {shown.length === 0 ? (
        <Text variant="callout" tone="variant" align="center">
          {`Nothing matches “${query.trim()}”`}
        </Text>
      ) : (
        <Grid minItemWidth={240} maxColumns={2}>
          {shown.map((provider) => (
            <ProviderCard key={provider} provider={provider} />
          ))}
        </Grid>
      )}
    </SettingsFrame>
  );
}
