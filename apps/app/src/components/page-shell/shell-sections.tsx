import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AppHref } from '../app-href';
import type { LinkNavigation } from '../interactive';
import { BottomSheet } from '../bottom-sheet';
import type { TabItem } from '../tabs-bar';
import { PHONE_TAB_LIMIT, type RailForm } from './layout';
import { RailGroups, type RailEntry, type RailGroup } from './section-rail';

export interface ShellSections {
  readonly groups: readonly RailGroup[];
  readonly active: string;
  readonly hrefOf: (id: string) => AppHref;
  readonly navigation?: LinkNavigation;
  readonly label?: string;
  readonly footer?: ReactNode;
  readonly phoneTabs?: readonly string[];
  readonly iconRail?: boolean;
}

export interface ShellTabs {
  readonly items: readonly TabItem[];
  readonly active: string;
  readonly label: string;
}

export interface ShellTabRow {
  readonly key: 'sections' | 'page';
  readonly tabs: ShellTabs;
}

export function railFormOf(sections: ShellSections | undefined): RailForm | null {
  if (sections === undefined) return null;
  return sections.iconRail === true ? 'icon' : 'sections';
}

function entriesOf(sections: ShellSections): readonly RailEntry[] {
  return sections.groups.flatMap((group) => group.entries);
}

export function sectionsPullUp(sections: ShellSections): boolean {
  return entriesOf(sections).length > PHONE_TAB_LIMIT;
}

export function phoneTabsOf(sections: ShellSections): ShellTabs | null {
  const entries = entriesOf(sections);
  const long = entries.length > PHONE_TAB_LIMIT;
  if (long && sections.phoneTabs === undefined) return null;
  const pinned = long ? (sections.phoneTabs ?? []) : entries.map((entry) => entry.id);
  const shown = entries.filter(
    (entry) => pinned.includes(entry.id) || (long && entry.id === sections.active),
  );
  if (shown.length === 0) return null;
  return {
    label: sections.label ?? 'Sections',
    active: sections.active,
    items: shown.map((entry) => ({
      key: entry.id,
      label: entry.short ?? entry.label,
      icon: entry.icon,
      href: sections.hrefOf(entry.id),
      ...(sections.navigation === undefined ? {} : { navigation: sections.navigation }),
    })),
  };
}

export function SectionsPullUp({
  open,
  onClose,
  title,
  sections,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly sections: ShellSections;
}): ReactNode {
  const rail = {
    groups: sections.groups,
    active: sections.active,
    width: 'wide',
    hrefOf: sections.hrefOf,
    navigation: sections.navigation,
  } as const;
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      label={sections.label ?? `${title} sections`}
      detents={['fit', 'full']}
    >
      <View className="gap-1 pb-4">
        <RailGroups rail={rail} onPress={onClose} />
        {sections.footer}
      </View>
    </BottomSheet>
  );
}
