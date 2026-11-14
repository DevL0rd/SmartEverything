import type { DriveItem } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveResult } from '../../../api/drive';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { ListRow } from '../../../components/list-row';
import { useRevealed } from '../../../components/show-more';
import { Text } from '../../../components/text';
import { bytes, count } from '../../../format/number';
import { plural } from '../../../format/text';
import { flattenPages, useDriveChips, useDriveDuplicates } from '../data';
import { drivePathOf, type DriveChipOf } from '../model/drive-chip';
import { KIND_LOOK } from '../recent/recent-model';
import { StorageCardState } from './storage-card-state';

export type DriveDuplicateGroup = DriveResult<'listDuplicates'>['items'][number];

export interface DuplicateKeepers {
  readonly busy: boolean;
  readonly keepBest: (sha256: string) => void;
  readonly keepAll: () => void;
}

export interface DuplicateRowView {
  readonly key: string;
  readonly title: string;
  readonly places: string;
  readonly item: DriveItem;
}

export function extraBytesOf(groups: readonly DriveDuplicateGroup[]): number {
  return groups.reduce((all, group) => all + group.bytes * (group.items.length - 1), 0);
}

export function placesOf(items: readonly DriveItem[], chipOf: DriveChipOf): string {
  const places = [
    ...new Set(items.map((item) => drivePathOf(chipOf(item.rootId), item.relPath))),
  ].filter((place) => place !== '');
  if (places.length <= 1) return places[0] ?? '';
  return `${places.slice(0, -1).join(', ')} and ${places.at(-1) ?? ''}`;
}

export function ownDuplicatesOf(
  groups: readonly DriveDuplicateGroup[],
  chipOf: DriveChipOf,
): readonly DriveDuplicateGroup[] {
  return groups.flatMap((group) => {
    const items = group.items.filter((item) => chipOf(item.rootId).key !== 'with-me');
    return items.length < 2 ? [] : [{ ...group, items }];
  });
}

export function duplicateRowOf(
  group: DriveDuplicateGroup,
  chipOf: DriveChipOf,
): DuplicateRowView | null {
  const [first] = group.items;
  if (first === undefined) return null;
  return {
    key: group.sha256,
    title: `${first.name} · ${plural(group.items.length, 'copy', 'copies')}`,
    places: placesOf(group.items, chipOf),
    item: first,
  };
}

export function duplicatesCaptionOf(
  groups: readonly DriveDuplicateGroup[],
  complete: boolean,
): string | null {
  if (!complete) return null;
  return `${plural(groups.length, 'group')} · ${bytes(extraBytesOf(groups))} to win back`;
}

export function keepAllLabelOf(groups: number, complete: boolean): string {
  return complete ? `Keep best in all ${count(groups)} groups` : 'Keep best in all groups';
}

export interface DuplicateGroupRowProps {
  readonly view: DuplicateRowView;
  readonly keepers: DuplicateKeepers | null;
}

export function DuplicateGroupRow({ view, keepers }: DuplicateGroupRowProps): ReactNode {
  return (
    <ListRow
      icon={KIND_LOOK[view.item.kind].icon}
      title={view.title}
      {...(view.places === '' ? {} : { subtitle: view.places })}
      label={view.places === '' ? view.title : `${view.title}, in ${view.places}`}
      {...(keepers === null
        ? {}
        : {
            trailing: (
              <Button
                label="Keep best"
                spoken={`Keep the best copy of ${view.item.name}`}
                variant="outlined"
                disabled={keepers.busy}
                onPress={() => {
                  keepers.keepBest(view.key);
                }}
              />
            ),
          })}
    />
  );
}

interface CardProps {
  readonly groups: readonly DriveDuplicateGroup[];
  readonly complete: boolean;
  readonly keepers: DuplicateKeepers | null;
}

export function DuplicatesCard({ groups, complete, keepers }: CardProps): ReactNode {
  const chipOf = useDriveChips();
  const views = groups.flatMap((group) => {
    const view = duplicateRowOf(group, chipOf);
    return view === null ? [] : [view];
  });
  const { shown, more } = useRevealed(views);
  const caption = duplicatesCaptionOf(groups, complete);
  return (
    <Card title="Duplicates" icon="copy">
      {caption === null ? null : (
        <Text variant="footnote" tone="variant" className="tabular">
          {caption}
        </Text>
      )}
      <View className="-mx-card-pad">
        {shown.map((view) => (
          <View key={view.key} className="border-t-hairline border-outline-variant">
            <DuplicateGroupRow view={view} keepers={keepers} />
          </View>
        ))}
        {more}
      </View>
      {keepers === null ? null : (
        <View className="flex-row flex-wrap">
          <Button
            label={keepAllLabelOf(groups.length, complete)}
            icon="copy"
            variant="tonal"
            wrap
            disabled={keepers.busy}
            onPress={keepers.keepAll}
          />
        </View>
      )}
    </Card>
  );
}

export function StorageDuplicates({
  keepers,
}: {
  readonly keepers: DuplicateKeepers | null;
}): ReactNode {
  const query = useDriveDuplicates(null);
  const chipOf = useDriveChips();
  if (query.data === undefined) {
    return (
      <StorageCardState
        title="Duplicates"
        icon="copy"
        query={query}
        failure="drive.storage.duplicates_refetch_failed"
      />
    );
  }
  const groups = ownDuplicatesOf(
    flattenPages(query.data, (page) => page.items),
    chipOf,
  );
  if (groups.length === 0) return null;
  return <DuplicatesCard groups={groups} complete={!query.hasNextPage} keepers={keepers} />;
}
