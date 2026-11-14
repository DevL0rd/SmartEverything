import { Fragment, type ReactNode } from 'react';
import { View } from 'react-native';
import type { AppHref } from '../app-href';
import { BottomSheet } from '../bottom-sheet';
import { Icon } from '../icon';
import { Interactive } from '../interactive';
import { railEntryLabel } from '../section-rail';
import { Text } from '../text';
import { cn } from '../../design/cn';
import { countText, railEntryOf, type LibrarySection, type LibrarySectionGroup } from './sections';

export interface SectionPullUpProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly groups: readonly LibrarySectionGroup[];
  readonly active: string;
  readonly hrefOf: (id: string) => AppHref;
  readonly summary?: ReactNode;
  readonly footer?: ReactNode;
}

function PullUpRow({
  section,
  selected,
  href,
  onClose,
}: {
  readonly section: LibrarySection;
  readonly selected: boolean;
  readonly href: AppHref;
  readonly onClose: () => void;
}): ReactNode {
  const count = countText(section.count);
  return (
    <Interactive
      href={href}
      onPress={onClose}
      selected={selected}
      label={railEntryLabel(railEntryOf(section))}
      className={cn(
        'min-h-12 flex-row items-center gap-3 rounded-md px-3 py-2',
        selected && 'bg-primary/12',
      )}
      layerClassName="rounded-md"
    >
      <Icon name={section.icon} size={24} tone={selected ? 'primary' : 'variant'} />
      <View className="min-w-0 flex-1">
        <Text variant="callout" numberOfLines={1}>
          {section.label}
        </Text>
        {section.detail}
      </View>
      {count === undefined ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
          {count}
        </Text>
      )}
    </Interactive>
  );
}

function GroupRows({
  group,
  active,
  hrefOf,
  onClose,
}: Pick<SectionPullUpProps, 'active' | 'hrefOf' | 'onClose'> & {
  readonly group: LibrarySectionGroup;
}): ReactNode {
  return (
    <>
      {group.title === null ? null : (
        <Text variant="footnote" tone="variant" className="px-3 pb-0.5 pt-3">
          {group.title}
        </Text>
      )}
      {group.sections.map((section) => (
        <PullUpRow
          key={section.id}
          section={section}
          selected={section.id === active}
          href={hrefOf(section.id)}
          onClose={onClose}
        />
      ))}
    </>
  );
}

export function SectionPullUp(props: SectionPullUpProps): ReactNode {
  return (
    <BottomSheet
      open={props.open}
      onClose={props.onClose}
      label={`${props.title} sections`}
      detents={['fit']}
    >
      <View className="gap-0.5 pb-2" accessibilityRole="list">
        {props.summary === undefined ? null : <View className="pb-2">{props.summary}</View>}
        {props.groups.map((group) => (
          <Fragment key={group.title ?? ''}>
            <GroupRows
              group={group}
              active={props.active}
              hrefOf={props.hrefOf}
              onClose={props.onClose}
            />
          </Fragment>
        ))}
        {props.footer}
      </View>
    </BottomSheet>
  );
}
