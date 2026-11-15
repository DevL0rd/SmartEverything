import type { ReactNode } from 'react';
import { View } from 'react-native';
import { mainPageSettings } from '../../../app-shell/main-pages';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { PageShell } from '../../../components/page-shell/page-shell';
import { Text } from '../../../components/text';
import { workspaceSectionsOf } from '../hosts/workspace-sections';
import { Filters, listSearchOf } from './filters';
import { QuestionsCard } from './questions-card';
import { useListActions, type ListActions } from './list-actions';
import type { ListLinks } from './list-links';
import { headerLine } from './list-view';
import { Overview } from './overview';
import { Sections } from './sections';
import { useAutomationsList, type AutomationsList, type ListEnvironment } from './use-list';

export interface ListProps {
  readonly environment: ListEnvironment;
  readonly links: ListLinks;
  readonly onNew: () => void;
}

interface ListBodyProps {
  readonly list: AutomationsList;
  readonly links: ListLinks;
  readonly actions: ListActions;
  readonly onNew: () => void;
}

function ListBody({ list, links, actions, onNew }: ListBodyProps): ReactNode {
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
  const search = listSearchOf(list);
  const filled = list.entries.length > 0;
  return (
    <PageShell
      title="Automations"
      back={false}
      settings={mainPageSettings('automations')}
      sections={workspaceSectionsOf('automations')}
      {...(filled ? { subtitle: headerLine(list.entries) } : {})}
      {...(search === undefined ? {} : { search })}
      {...(filled
        ? { toolbar: <Filters choices={list.choices} view={list.view} onChange={list.setView} /> }
        : {})}
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
      <ListBody list={list} links={links} actions={actions} onNew={onNew} />
    </PageShell>
  );
}
