import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { cn } from '../../../design/cn';
import { WIDTH_BREAKPOINTS } from '../../../design/size-class';
import { ListBody, type ListProps } from './automations-screen';
import { HealthStrip } from './health-strip';
import { useListActions } from './list-actions';
import { headerLine } from './list-view';
import { TimelineBand } from './timeline-band';
import { useAutomationsList } from './use-list';
import { WorkspaceRail } from './workspace-rail';

export function AutomationsMaster({
  environment,
  links,
  onNew,
  selectedId = null,
  section,
}: ListProps & { readonly selectedId?: string | null; readonly section: string }): ReactNode {
  const list = useAutomationsList(environment);
  const actions = useListActions();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="gap-3 px-4 pb-6 pt-safe-offset-6"
    >
      <View className="min-h-page-header flex-row items-center gap-2 pl-2">
        <View className="min-w-0 flex-1">
          <Text variant="title-1" accessibilityRole="header">
            Automations
          </Text>
          {list.entries.length === 0 ? null : (
            <Text variant="caption" tone="variant" numberOfLines={1}>
              {headerLine(list.entries)}
            </Text>
          )}
        </View>
        <IconButton icon="plus" label="New automation" variant="tonal" onPress={onNew} />
      </View>
      <WorkspaceRail
        links={links.workspace}
        extras={links.extras}
        active={section}
        orientation="column"
      />
      <ListBody
        list={list}
        links={links}
        actions={actions}
        onNew={onNew}
        selectedId={selectedId}
        overview={false}
      />
    </ScrollView>
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
    <ScrollView contentContainerClassName="px-6 pb-6 pt-safe-offset-6">
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
    </ScrollView>
  );
}
