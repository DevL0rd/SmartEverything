import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import type { DriveItem } from '@smarteverything/domain';
import { TabsBar, type TabItem } from '../../../components/tabs-bar';
import { SharingTab } from '../share/sharing-tab';
import { ActivityTab } from './activity-tab';
import {
  TAB_LABEL,
  activeTabOf,
  rememberTab,
  tabsOf,
  useRememberedTab,
  type DetailsSlots,
  type DetailsSubject,
  type DetailsTab,
} from './details-model';
import { InfoTab } from './info-tab';
import { PreviewTab } from './preview-tab';
import { VersionsTab } from './versions-tab';

export function useDetailsTab(item: DriveItem): {
  readonly tabs: readonly DetailsTab[];
  readonly active: DetailsTab;
} {
  const tabs = tabsOf(item);
  return { tabs, active: activeTabOf(useRememberedTab(), tabs) };
}

function itemsOf(tabs: readonly DetailsTab[]): readonly TabItem[] {
  return tabs.map((tab) => ({
    key: tab,
    label: TAB_LABEL[tab],
    onPress: (): void => {
      rememberTab(tab);
    },
  }));
}

export interface DetailsTabsProps {
  readonly subject: DetailsSubject;
  readonly slots: DetailsSlots;
  readonly share: (item: DriveItem) => void;
  readonly pane: boolean;
}

function TabBody({ tab, ...props }: DetailsTabsProps & { readonly tab: DetailsTab }): ReactNode {
  const { subject, slots, share, pane } = props;
  const key = subject.item.id;
  switch (tab) {
    case 'preview':
      return <PreviewTab item={subject.item} quickLook={slots.quickLook} />;
    case 'info':
      return <InfoTab subject={subject} share={share} pane={pane} />;
    case 'versions':
      return <VersionsTab key={key} subject={subject} />;
    case 'activity':
      return <ActivityTab key={key} subject={subject} />;
    case 'sharing':
      return <SharingTab key={key} subject={subject} onShare={share} />;
  }
}

export function DetailsTabs(props: DetailsTabsProps): ReactNode {
  const { subject, pane } = props;
  const { tabs, active } = useDetailsTab(subject.item);
  const body = <TabBody tab={active} {...props} />;
  return (
    <View className={pane ? 'min-h-0 flex-1' : ''}>
      <TabsBar label={`Details of ${subject.item.name}`} items={itemsOf(tabs)} active={active} />
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
