import type { ReactNode } from 'react';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { usePathname } from 'expo-router';
import { IconButton } from '../../../components/icon-button';
import { SearchField } from '../../../components/search-field';
import { Text } from '../../../components/text';
import { useAutomationsPage } from '../data/use-automations';
import { AutomationSections } from './automation-sections';
import { PagesList } from './pages-list';
import { useNewAutomation } from './new-automation';

const SELECTED = /^\/automations\/([^/]+)/;

function selectedIdOf(pathname: string): string | null {
  return SELECTED.exec(pathname)?.[1] ?? null;
}

export function AutomationsMaster(): ReactNode {
  const page = useAutomationsPage();
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const creator = useNewAutomation(page.ideas);
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="gap-section-gap px-4 pb-6 pt-safe-offset-6"
    >
      <View className="min-h-page-header flex-row items-center gap-2 pl-2">
        <Text variant="title-1" accessibilityRole="header" className="flex-1">
          Automations
        </Text>
        <IconButton icon="plus" label="New automation" variant="tonal" onPress={creator.open} />
      </View>
      <PagesList pathname={pathname} />
      {page.rules.length === 0 ? null : (
        <>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Find an automation"
            variant="field"
          />
          <AutomationSections
            rules={page.rules}
            catalog={page.catalog}
            query={query}
            selectedId={selectedIdOf(pathname)}
          />
        </>
      )}
      {creator.sheet}
    </ScrollView>
  );
}
