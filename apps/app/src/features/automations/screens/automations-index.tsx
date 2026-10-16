import type { ReactNode } from 'react';
import { mainPageSettings } from '../../../app-shell/main-pages';
import { useState } from 'react';
import { href } from '../../../app-shell/hrefs';
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

function useActions(): readonly HeaderAction[] {
  return useIdiom() === 'pointer'
    ? [{ icon: 'sparkles', label: 'Scenes', href: href.scenes() }]
    : [];
}

interface ListBodyProps {
  readonly page: AutomationsPage;
}

function ListBody({ page }: ListBodyProps): ReactNode {
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
  const actions = useActions();
  const touch = useIdiom() === 'touch';
  const creator = useNewAutomation(page.ideas);
  const scenes = page.catalog.scenes.length;
  const upcoming = upcomingOf(useScheduledRows()).length;
  return (
    <Screen
      header={
        <PageHeader
          title="Automations"
          settings={mainPageSettings('automations')}
          {...subtitleProp(countLine(page.rules))}
          actions={actions}
        />
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
          <NavRow title="Values" icon="customize" href={href.automationValues()} />
          <NavRow title="Sequences" icon="layers" href={href.automationSequences()} />
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
