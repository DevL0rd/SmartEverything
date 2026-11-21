import type { ReactNode } from 'react';
import { View } from 'react-native';
import { mainPageSettings } from '../../../app-shell/main-pages';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { PageShell } from '../../../components/page-shell/page-shell';
import { Text } from '../../../components/text';
import { workspaceSectionsOf } from '../hosts/workspace-sections';
import { Filters } from './filters';
import { QuestionsCard } from './questions-card';
import { useListActions, type ListActions } from './list-actions';
import { AutomationsListContext, useListContext } from './list-context';
import type { ListLinks } from './list-links';
import { headerLine } from './list-view';
import { Overview } from './overview';
import { Sections } from './sections';
import { useAutomationsList, type ListEnvironment } from './use-list';

export interface ListProps {
  readonly environment: ListEnvironment;
  readonly links: ListLinks;
  readonly onNew: () => void;
}

interface ListBodyProps {
  readonly links: ListLinks;
  readonly actions: ListActions;
  readonly onNew: () => void;
}

function ListBody({ links, actions, onNew }: ListBodyProps): ReactNode {
  const list = useListContext();
  if (list.entries.length === 0) {
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
      <QuestionsCard timeZone={list.timeZone} />
      <Overview list={list} links={links} />
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
        />
      )}
    </View>
  );
}

export function AutomationsScreen({ environment, links, onNew }: ListProps): ReactNode {
  const list = useAutomationsList(environment);
  const actions = useListActions();
  const filled = list.entries.length > 0;
  const subtitle = filled ? headerLine(list.entries) : undefined;
  const toolbar = filled ? (
    <Filters
      choices={list.choices}
      filter={list.view.filter}
      sort={list.view.sort}
      onFilter={list.setFilter}
      onSort={list.setSort}
    />
  ) : undefined;
  const search = list.search;
  return (
    <AutomationsListContext value={list}>
      <PageShell
        title="Automations"
        back={false}
        settings={mainPageSettings('automations')}
        sections={workspaceSectionsOf('automations')}
        {...(subtitle === undefined ? {} : { subtitle })}
        {...(search === undefined ? {} : { search })}
        {...(toolbar === undefined ? {} : { toolbar })}
        primaryAction={{
          label: 'New automation',
          icon: 'plus',
          onPress: onNew,
          extended: !filled,
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
        <ListBody links={links} actions={actions} onNew={onNew} />
      </PageShell>
    </AutomationsListContext>
  );
}
