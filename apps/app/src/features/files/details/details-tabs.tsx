import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { activeTabOf, tabsOf } from './details-model';
import { DetailsTabStrip } from './details-tab-strip';
import type { DetailsProps } from './details-host';
import { InfoTab } from './info-tab';
import { PreviewTab } from './preview-tab';
import { useRememberedTab } from './tab-memory';

function TabBody<O>({
  tab,
  pane,
  ...props
}: DetailsProps<O> & { readonly tab: string; readonly pane: boolean }): ReactNode {
  const { node, host } = props;
  if (tab === 'preview') return <PreviewTab {...props} />;
  if (tab === 'info') return <InfoTab {...props} pane={pane} />;
  const spec = host.source.tabs(node).find((candidate) => candidate.id === tab);
  if (spec === undefined) return null;
  const { Tab } = spec;
  return <Tab key={node.key} node={node} />;
}

export function DetailsTabs<O>({
  pane,
  ...props
}: DetailsProps<O> & { readonly pane: boolean }): ReactNode {
  const { node, host } = props;
  const tabs = tabsOf(node, host.abilities, host.source.tabs(node));
  const active = activeTabOf(useRememberedTab(), tabs);
  if (tabs.length === 0) return null;
  const body = <TabBody tab={active} pane={pane} {...props} />;
  return (
    <View className={pane ? 'min-h-0 flex-1' : ''}>
      <DetailsTabStrip label={`Details of ${node.name}`} tabs={tabs} active={active} />
      {pane ? (
        <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-4 p-4">
          {body}
        </ScrollView>
      ) : (
        <View className="gap-4 px-4 pb-6 pt-4">{body}</View>
      )}
    </View>
  );
}
