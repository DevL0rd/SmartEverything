import type { ReactNode } from 'react';
import { useDeferredValue, useState } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { ListRow } from '../../../components/list-row';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { SearchField } from '../../../components/search-field';
import { Text } from '../../../components/text';
import { VirtualList } from '../../../components/virtual-list';
import { plural } from '../../../format/text';
import { matchingLicences, type Licence } from './licences';

function LicenceRow({ entry }: { readonly entry: Licence }): ReactNode {
  return <ListRow title={entry.name} subtitle={entry.version} value={entry.licence} />;
}

export function LicencesScreen(): ReactNode {
  const [query, setQuery] = useState('');
  const shown = matchingLicences(useDeferredValue(query));
  return (
    <Screen
      scroll={false}
      maxWidth="reading"
      header={
        <PageHeader
          title="Open-source licences"
          breadcrumbs={[
            { label: 'Settings', href: href.settings.index() },
            { label: 'About', href: href.settings.page('about') },
          ]}
        />
      }
    >
      <View className="w-full max-w-reading flex-1 self-center">
        <VirtualList
          sections={[{ key: 'all', title: plural(shown.length, 'package'), data: shown }]}
          keyOf={(entry) => `${entry.name}@${entry.version}`}
          renderItem={(entry) => <LicenceRow entry={entry} />}
          header={
            <View className="gap-2 px-gutter pt-2">
              <SearchField value={query} onChange={setQuery} placeholder="Search packages" />
              <Text variant="footnote" tone="variant">
                SmartEverything is built on these projects. Thank you.
              </Text>
            </View>
          }
          empty={
            <Text variant="body" tone="variant" className="px-gutter py-6">
              {`Nothing matches “${query.trim()}”.`}
            </Text>
          }
        />
      </View>
    </Screen>
  );
}
