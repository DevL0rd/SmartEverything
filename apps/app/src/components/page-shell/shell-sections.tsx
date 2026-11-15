import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AppHref } from '../app-href';
import type { LinkNavigation } from '../interactive';
import type { TabItem } from '../tabs-bar';
import { stackedRail, type RailForm, type RailWidth } from './layout';
import { SectionRail, type RailGroup } from './section-rail';

export interface ShellSections {
  readonly groups: readonly RailGroup[];
  readonly active: string;
  readonly hrefOf: (id: string) => AppHref;
  readonly navigation?: LinkNavigation;
  readonly label?: string;
  readonly footer?: ReactNode;
  readonly iconRail?: boolean;
}

export interface ShellTabs {
  readonly items: readonly TabItem[];
  readonly active: string;
  readonly label: string;
}

export function railFormOf(sections: ShellSections | undefined): RailForm | null {
  if (sections === undefined) return null;
  return sections.iconRail === true ? 'icon' : 'sections';
}

export function ShellRail({
  sections,
  rail,
  safeTop,
}: {
  readonly sections: ShellSections;
  readonly rail: RailWidth;
  readonly safeTop: boolean;
}): ReactNode {
  return (
    <View testID="shell-rail" className="flex-row">
      <SectionRail
        groups={sections.groups}
        active={sections.active}
        width={rail}
        hrefOf={sections.hrefOf}
        navigation={sections.navigation}
        label={sections.label ?? 'Sections'}
        safeTop={safeTop}
        {...(stackedRail(rail) || sections.footer === undefined ? {} : { footer: sections.footer })}
      />
    </View>
  );
}
