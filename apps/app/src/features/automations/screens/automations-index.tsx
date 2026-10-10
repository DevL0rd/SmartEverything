import type { ReactNode } from 'react';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import type { MenuItem } from '../../../components/menu';
import { PageHeader, type HeaderAction } from '../../../components/page-header';
import { NavRow } from '../../../components/rows';
import { Screen } from '../../../components/screen';
import { SearchField } from '../../../components/search-field';
import { List } from '../../../components/section';
import { useIdiom } from '../../../design/platform';
import { useSizeClass } from '../../../design/size-class';
import { plural } from '../../../format/text';
import { AutomationSections } from '../components/automation-sections';
import { FirstRun } from '../components/ideas';
import { useNewAutomation } from '../components/new-automation';
import { NextUp } from '../components/next-up';
import { PlaceBanner } from '../components/place-banner';
import { countLine, useAutomationsPage, type AutomationsPage } from '../data/use-automations';
import { useScheduledRows } from '../scheduled/use-scheduled';
import { upcomingOf } from '../scheduled/view';
import { AutomationsOverview } from './automations-overview';
import { isMasterWidth, subtitleProp } from './shared';

const SEARCH_FROM = 8;

function useMenus(): { readonly actions: HeaderAction[]; readonly overflow: MenuItem[] } {
  const router = useRouter();
  const pointer = useIdiom() === 'pointer';
  return {
    actions: pointer ? [{ icon: 'sparkles', label: 'Scenes', href: href.scenes() }] : [],
    overflow: [
      {
        label: 'Scheduled',
        icon: 'timer',
        onPress: (): void => {
          router.push(href.scheduled());
        },
      },
      {
        label: 'Schedule',
        icon: 'calendar',
        onPress: (): void => {
          router.push(href.automationSchedule());
        },
      },
      {
        label: 'Run history',
        icon: 'activity',
        onPress: (): void => {
          router.push(href.automationRuns());
        },
      },
    ],
  };
}

function ListBody({ page }: { readonly page: AutomationsPage }): ReactNode {
  const [query, setQuery] = useState('');
  const { rules, reading, catalog } = page;
  return (
    <>
      {reading.usable ? <NextUp rules={rules} place={reading.place} /> : null}
      {rules.length >= SEARCH_FROM ? (
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Find an automation"
          variant="field"
        />
      ) : null}
      <AutomationSections rules={rules} catalog={catalog} query={query} />
    </>
  );
}

function AutomationsList(): ReactNode {
  const page = useAutomationsPage();
  const menus = useMenus();
  const touch = useIdiom() === 'touch';
  const creator = useNewAutomation(page.ideas);
  const scenes = page.catalog.scenes.length;
  const upcoming = upcomingOf(useScheduledRows()).length;
  return (
    <Screen
      header={
        <PageHeader title="Automations" {...subtitleProp(countLine(page.rules))} {...menus} />
      }
      maxWidth="reading"
      primaryAction={{
        label: 'New automation',
        icon: 'plus',
        onPress: creator.open,
        extended: page.rules.length === 0,
      }}
      {...(page.status.kind === 'ok' ? {} : { banner: <PlaceBanner status={page.status} /> })}
    >
      {touch ? (
        <List inset>
          <NavRow
            title="Scenes"
            subtitle={scenes === 0 ? 'Set several devices at once' : plural(scenes, 'scene')}
            icon="sparkles"
            href={href.scenes()}
          />
          <NavRow
            title="Scheduled"
            subtitle={upcoming === 0 ? 'Do something once, later' : `${String(upcoming)} coming up`}
            icon="timer"
            href={href.scheduled()}
          />
        </List>
      ) : null}
      {page.rules.length === 0 ? <FirstRun ideas={page.ideas} /> : <ListBody page={page} />}
      {creator.sheet}
    </Screen>
  );
}

export function AutomationsIndex(): ReactNode {
  const { width } = useSizeClass();
  return isMasterWidth(width) ? <AutomationsOverview /> : <AutomationsList />;
}
