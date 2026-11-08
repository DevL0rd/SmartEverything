import type { ReactNode } from 'react';
import { useDeferredValue, useState } from 'react';
import { View } from 'react-native';
import { ListRow } from '../../../components/list-row';
import { SearchField } from '../../../components/search-field';
import { Text } from '../../../components/text';
import { VirtualList } from '../../../components/virtual-list';
import { joinParts, plural } from '../../../format/text';
import { SettingsFrame } from '../../../settings/settings-frame';
import { matchingLicences, type Licence } from './licences';

function LicenceRow({ entry }: { readonly entry: Licence }): ReactNode {
  return (
    <ListRow
      title={entry.name}
      subtitle={joinParts([entry.version, entry.licence])}
      compact
      wrapTitle
      wrapSubtitle
    />
  );
}

export function LicencesScreen(): ReactNode {
  const [query, setQuery] = useState('');
  const search = useDeferredValue(query).trim();
  const shown = matchingLicences(search);
  return (
    <SettingsFrame page="about/licences" scroll={false}>
      <View className="w-full max-w-detail flex-1 self-start">
        <VirtualList
          sections={
            shown.length === 0
              ? []
              : [{ key: 'all', title: plural(shown.length, 'package'), data: shown }]
          }
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
            <Text
              variant="body"
              tone="variant"
              className="px-gutter py-6"
              accessibilityLiveRegion="polite"
            >
              {search === '' ? 'No packages are listed.' : 'No packages match your search.'}
            </Text>
          }
        />
      </View>
    </SettingsFrame>
  );
}
