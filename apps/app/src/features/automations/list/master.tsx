import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { PageShell } from '../../../components/page-shell/page-shell';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { cn } from '../../../design/cn';
import { WIDTH_BREAKPOINTS } from '../../../design/size-class';
import { ListBody, type ListProps } from './automations-screen';
import { HealthStrip } from './health-strip';
import { useListActions } from './list-actions';
import { headerLine } from './list-view';
import { TimelineBand } from './timeline-band';
import { listSearchOf } from './filters';
import { useAutomationsList, type AutomationsList } from './use-list';
import { WorkspaceRail } from './workspace-rail';

function MasterHeading({ list }: { readonly list: AutomationsList }): ReactNode {
  return (
    <View className="min-w-0">
      <Text variant="title-3" accessibilityRole="header" numberOfLines={1}>
        Automations
      </Text>
      {list.entries.length === 0 ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {headerLine(list.entries)}
        </Text>
      )}
    </View>
  );
}

export function AutomationsMaster({
  environment,
  links,
  onNew,
  selectedId = null,
  section,
}: ListProps & { readonly selectedId?: string | null; readonly section: string }): ReactNode {
  const list = useAutomationsList(environment);
  const actions = useListActions();
  const search = listSearchOf(list);
  return (
    <PageShell
      variant="pane"
      title="Automations"
      back={false}
      heading={<MasterHeading list={list} />}
      actions={[{ icon: 'plus', label: 'New automation', onPress: onNew }]}
      {...(search === undefined ? {} : { search })}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-3 px-gutter py-4"
      >
        <WorkspaceRail links={links.workspace} extras={links.extras} active={section} />
        <ListBody
          list={list}
          links={links}
          actions={actions}
          onNew={onNew}
          selectedId={selectedId}
          overview={false}
        />
      </ScrollView>
    </PageShell>
  );
}

function overviewWidth(width: number): number {
  return width >= WIDTH_BREAKPOINTS.large ? WIDTH_BREAKPOINTS.large : 0;
}

export function AutomationsOverviewPane({
  environment,
  links,
}: Pick<ListProps, 'environment' | 'links'>): ReactNode {
  const list = useAutomationsList(environment);
  const { width, onLayout } = useMeasuredWidth(overviewWidth);
  const paired = width === WIDTH_BREAKPOINTS.large;
  const paneClass = cn(paired && 'min-w-0 flex-1');
  return (
    <PageShell
      title="Overview"
      {...(list.entries.length === 0 ? {} : { subtitle: headerLine(list.entries) })}
      width="full"
    >
      <View onLayout={onLayout} className={cn('gap-3', paired && 'flex-row items-start')}>
        <View className={paneClass}>
          <HealthStrip
            health={list.health}
            next={list.next}
            timeZone={list.timeZone}
            paired={paired}
          />
        </View>
        <View className={paneClass}>
          <TimelineBand events={list.events} links={links} timeZone={list.timeZone} />
        </View>
      </View>
    </PageShell>
  );
}
