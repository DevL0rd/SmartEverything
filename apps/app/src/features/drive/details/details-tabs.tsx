import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import type { DriveItem } from '@smarteverything/domain';
import { TabsBar, type TabItem } from '../../../components/tabs-bar';
import {
  TAB_LABEL,
  activeTabOf,
  rememberTab,
  slottedTabsOf,
  tabsOf,
  useRememberedTab,
  type DetailsSlots,
  type DetailsSubject,
  type DetailsTab,
} from './details-model';
import { InfoTab } from './info-tab';
import { PreviewTab } from './preview-tab';

export function useDetailsTab(
  item: DriveItem,
  slots: DetailsSlots,
): {
  readonly tabs: readonly DetailsTab[];
  readonly active: DetailsTab;
} {
  const tabs = tabsOf(item, slottedTabsOf(slots));
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

function TabBody({
  tab,
  subject,
  slots,
  pane,
}: {
  readonly tab: DetailsTab;
  readonly subject: DetailsSubject;
  readonly slots: DetailsSlots;
  readonly pane: boolean;
}): ReactNode {
  switch (tab) {
    case 'preview':
      return <PreviewTab item={subject.item} quickLook={slots.quickLook} />;
    case 'info':
      return <InfoTab subject={subject} share={slots.share} pane={pane} />;
    case 'versions':
    case 'activity':
    case 'sharing':
      return slots[tab]?.(subject) ?? null;
  }
}

export function DetailsTabs({
  subject,
  slots,
  pane,
}: {
  readonly subject: DetailsSubject;
  readonly slots: DetailsSlots;
  readonly pane: boolean;
}): ReactNode {
  const { tabs, active } = useDetailsTab(subject.item, slots);
  const body = <TabBody tab={active} subject={subject} slots={slots} pane={pane} />;
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
