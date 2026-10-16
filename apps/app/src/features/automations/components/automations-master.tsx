import type { ReactNode } from 'react';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { usePathname } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { IconButton } from '../../../components/icon-button';
import { NavRow } from '../../../components/rows';
import { SearchField } from '../../../components/search-field';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { plural } from '../../../format/text';
import { useAutomationsPage } from '../data/use-automations';
import { useScheduledRows } from '../scheduled/use-scheduled';
import { upcomingOf } from '../scheduled/view';
import { AutomationSections } from './automation-sections';
import { useNewAutomation } from './new-automation';

const SELECTED = /^\/automations\/([^/]+)/;

function selectedIdOf(pathname: string): string | null {
  return SELECTED.exec(pathname)?.[1] ?? null;
}

interface PagesProps {
  readonly pathname: string;
  readonly scenes: number;
}

function Pages({ pathname, scenes }: PagesProps): ReactNode {
  const upcoming = upcomingOf(useScheduledRows()).length;
  return (
    <List inset>
      <NavRow title="Values" icon="customize" href={href.automationValues()} />
      <NavRow title="Sequences" icon="layers" href={href.automationSequences()} />
      <NavRow
        title="Scenes"
        icon="sparkles"
        value={scenes === 0 ? 'None yet' : plural(scenes, 'scene')}
        href={href.scenes()}
        selected={pathname.startsWith('/automations/scenes')}
      />
      <NavRow
        title="Scheduled"
        icon="timer"
        value={upcoming === 0 ? 'None' : `${String(upcoming)} coming up`}
        href={href.scheduled()}
        selected={pathname.startsWith('/automations/scheduled')}
      />
      <NavRow
        title="Schedule"
        icon="calendar"
        href={href.automationSchedule()}
        selected={pathname === '/automations/schedule'}
      />
      <NavRow
        title="Run history"
        icon="activity"
        href={href.automationRuns()}
        selected={pathname === '/automations/runs'}
      />
    </List>
  );
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
      <Pages pathname={pathname} scenes={page.catalog.scenes.length} />
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
