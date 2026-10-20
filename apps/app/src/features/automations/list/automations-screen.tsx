import type { ReactNode } from 'react';
import { View } from 'react-native';
import { mainPageSettings } from '../../../app-shell/main-pages';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { Text } from '../../../components/text';
import { Filters } from './filters';
import { QuestionsCard } from './questions-card';
import { HealthStrip } from './health-strip';
import { useListActions, type ListActions } from './list-actions';
import type { ListLinks } from './list-links';
import { headerLine } from './list-view';
import { Sections } from './sections';
import { TimelineBand } from './timeline-band';
import { useAutomationsList, type AutomationsList, type ListEnvironment } from './use-list';
import { WorkspaceRail } from './workspace-rail';

export interface ListProps {
  readonly environment: ListEnvironment;
  readonly links: ListLinks;
  readonly onNew: () => void;
}

export interface ListBodyProps {
  readonly list: AutomationsList;
  readonly links: ListLinks;
  readonly actions: ListActions;
  readonly onNew: () => void;
  readonly selectedId?: string | null;
  readonly overview: boolean;
}

function Overview({
  list,
  links,
}: {
  readonly list: AutomationsList;
  readonly links: ListLinks;
}): ReactNode {
  return (
    <>
      <QuestionsCard timeZone={list.timeZone} />
      <HealthStrip
        health={list.health}
        next={list.next}
        timeZone={list.timeZone}
        onFilter={(filter) => {
          list.setView({ ...list.view, filter });
        }}
      />
      <TimelineBand events={list.events} links={links} timeZone={list.timeZone} />
    </>
  );
}

export function ListBody({
  list,
  links,
  actions,
  onNew,
  selectedId = null,
  overview,
}: ListBodyProps): ReactNode {
  const { entries, view } = list;
  if (entries.length === 0) {
    return (
      <EmptyState
        icon="automations"
        title="No automations yet"
        body="Start from an idea or build your own."
        action={<Button label="New automation" icon="plus" onPress={onNew} />}
      />
    );
  }
  return (
    <View className="gap-section-gap">
      {overview ? <Overview list={list} links={links} /> : null}
      <Filters choices={list.choices} view={view} total={entries.length} onChange={list.setView} />
      {list.shown === 0 ? (
        <Text variant="body" tone="variant" align="center" className="py-6">
          Nothing matches
        </Text>
      ) : (
        <Sections
          sections={list.sections}
          total={list.shown}
          iconOf={list.iconOf}
          links={links}
          actions={actions}
          timeZone={list.timeZone}
          selectedId={selectedId}
        />
      )}
    </View>
  );
}

export function AutomationsScreen({ environment, links, onNew }: ListProps): ReactNode {
  const list = useAutomationsList(environment);
  const actions = useListActions();
  return (
    <Screen
      header={
        <PageHeader
          title="Automations"
          settings={mainPageSettings('automations')}
          {...(list.entries.length === 0 ? {} : { subtitle: headerLine(list.entries) })}
        />
      }
      maxWidth="reading"
      primaryAction={{
        label: 'New automation',
        icon: 'plus',
        onPress: onNew,
        extended: list.entries.length === 0,
      }}
      {...(list.rejected === 0
        ? {}
        : {
            banner: (
              <Banner
                tone="warning"
                title={`${String(list.rejected)} automations couldn’t be read`}
              />
            ),
          })}
    >
      <WorkspaceRail
        links={links.workspace}
        extras={links.extras}
        active="automations"
        orientation="row"
      />
      <ListBody list={list} links={links} actions={actions} onNew={onNew} overview />
    </Screen>
  );
}
