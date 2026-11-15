import { Fragment, type ReactNode } from 'react';
import { View } from 'react-native';
import type { AppHref } from '../app-href';
import type { LinkNavigation } from '../interactive';
import { BottomSheet } from '../bottom-sheet';
import type { TabItem } from '../tabs-bar';
import { Text } from '../text';
import { PHONE_TAB_LIMIT, type RailForm } from './layout';
import { RailItem, type RailEntry, type RailGroup } from './section-rail';

export interface ShellSections {
  readonly groups: readonly RailGroup[];
  readonly active: string;
  readonly hrefOf: (id: string) => AppHref;
  readonly navigation?: LinkNavigation;
  readonly label?: string;
  readonly footer?: ReactNode;
  readonly phoneTabs?: readonly string[];
  readonly master?: boolean;
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
  if (sections.iconRail === true) return 'icon';
  return sections.master === true ? 'master' : 'sections';
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
      detents={['half', 'full']}
    >
      <View className="gap-1 pb-4">
        {sections.groups.map((group) => (
          <Fragment key={group.title ?? ''}>
            {group.title === null ? null : (
              <Text variant="footnote" tone="variant" className="px-3 pt-4">
                {group.title}
              </Text>
            )}
            {group.entries.map((entry) => (
              <RailItem key={entry.id} entry={entry} rail={rail} onPress={onClose} />
            ))}
          </Fragment>
        ))}
        {sections.footer}
      </View>
    </BottomSheet>
  );
}
