import type { PlannerCollectionRow, PlannerItemRow } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { duration } from '../../../format/time';
import { PriorityFlag, priorityOf } from '../tasks/priority-flag';
import { LIST_DOT } from './composer-tokens';
import { useItemOpen } from './selection';

function CollectionChip({ collection }: { readonly collection: PlannerCollectionRow }): ReactNode {
  return (
    <View className="flex-row items-center gap-1.5 rounded-full bg-surface-3 px-2 py-0.5">
      <View className={cn('size-2 rounded-full', LIST_DOT[collection.colour])} />
      <Text variant="caption" tone="variant">
        {collection.name}
      </Text>
    </View>
  );
}

function StepOfLink({ parent }: { readonly parent: PlannerItemRow }): ReactNode {
  const open = useItemOpen(parent.id, 'single');
  const pointer = useIdiom() === 'pointer';
  return (
    <Interactive
      {...open}
      label={`Step of ${parent.title}, open it`}
      className={cn(
        'flex-row items-center gap-1.5 self-start rounded-sm',
        pointer ? 'min-h-8' : 'min-h-touch-min',
      )}
      layerClassName="rounded-sm"
    >
      <Text variant="footnote" tone="variant">
        Step of
      </Text>
      <Text variant="footnote" tone="primary" numberOfLines={1} className="shrink">
        {parent.title}
      </Text>
    </Interactive>
  );
}

export interface ItemMetaProps {
  readonly item: PlannerItemRow;
  readonly collection: PlannerCollectionRow | null;
  readonly parent: PlannerItemRow | null;
  readonly inPanel: boolean;
  readonly facts: boolean;
}

function MetaFacts({ item }: { readonly item: PlannerItemRow }): ReactNode {
  return (
    <>
      {item.tags.map((tag) => (
        <Text key={tag} variant="footnote" tone="variant">
          {`#${tag}`}
        </Text>
      ))}
      {item.estimate_minutes === null ? null : (
        <Text variant="footnote" tone="variant" className="tabular">
          {duration(item.estimate_minutes * 60)}
        </Text>
      )}
    </>
  );
}

function metaRowShown({ item, inPanel, facts }: ItemMetaProps): boolean {
  if (!inPanel || priorityOf(item.priority) !== null) return true;
  return facts && (item.tags.length > 0 || item.estimate_minutes !== null);
}

function MetaRow({ item, collection, inPanel, facts }: ItemMetaProps): ReactNode {
  const priority = priorityOf(item.priority);
  const source = item.google === null ? 'this hub' : 'Google';
  const kind = item.kind === 'event' ? 'Event' : 'Task';
  return (
    <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
      {inPanel || collection === null ? null : <CollectionChip collection={collection} />}
      {priority === null ? null : <PriorityFlag priority={priority} />}
      {facts ? <MetaFacts item={item} /> : null}
      {inPanel ? null : (
        <Text variant="footnote" tone="variant">
          {`${kind} · ${source}`}
        </Text>
      )}
    </View>
  );
}

export function ItemMeta(props: ItemMetaProps): ReactNode {
  return (
    <View className="gap-1">
      {metaRowShown(props) ? <MetaRow {...props} /> : null}
      {props.parent === null ? null : <StepOfLink parent={props.parent} />}
    </View>
  );
}

export function parentIn(
  items: readonly PlannerItemRow[],
  item: PlannerItemRow,
): PlannerItemRow | null {
  if (item.parent_id === null) return null;
  return items.find((row) => row.id === item.parent_id) ?? null;
}
