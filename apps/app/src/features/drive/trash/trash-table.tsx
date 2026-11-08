import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/checkbox';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import type { DeletedByShare } from './deleted-by';
import type { LeavingMonth } from './leaving-bars';
import type { PickState } from './selection';
import { TABLE_COLUMNS, type TrashLayout } from './trash-layout';
import { CheckMark } from './trash-row';
import { TrashSummary } from './trash-summary';

export interface TableTopProps {
  readonly layout: TrashLayout;
  readonly shares: readonly DeletedByShare[];
  readonly months: readonly LeavingMonth[] | null;
  readonly pickState: PickState;
  readonly onToggleAll: () => void;
  readonly deleteAll: { readonly disabled: boolean; readonly onPress: () => void } | null;
  readonly filterRow: ReactNode;
}

function Heading({
  text,
  className,
}: {
  readonly text: string;
  readonly className: string;
}): ReactNode {
  return (
    <Text variant="caption" tone="variant" numberOfLines={1} className={className}>
      {text}
    </Text>
  );
}

function ColumnHeader({
  pickState,
  onToggleAll,
}: Pick<TableTopProps, 'pickState' | 'onToggleAll'>): ReactNode {
  return (
    <View className="h-10 flex-row items-center pl-4 pr-3">
      <View className="min-w-0 flex-1 flex-row items-center gap-3">
        <Interactive
          role="checkbox"
          checked={pickState}
          label="Select all"
          onPress={onToggleAll}
          hitSlop={12}
          className="h-10 items-center justify-center rounded-xs"
          layerClassName="rounded-xs"
        >
          <CheckMark state={pickState} />
        </Interactive>
        <View className="w-7" />
        <Heading text="Name" className="min-w-0 flex-1" />
        <Heading text="Was in" className={TABLE_COLUMNS.wasIn} />
        <Heading text="Deleted by" className={TABLE_COLUMNS.deletedBy} />
        <Heading text="Size" className={cn(TABLE_COLUMNS.size, 'text-right')} />
        <Heading text="Leaves in" className={TABLE_COLUMNS.leaves} />
      </View>
      <View className={TABLE_COLUMNS.restore} />
    </View>
  );
}

function Toolbar({
  layout,
  pickState,
  onToggleAll,
  deleteAll,
}: Omit<TableTopProps, 'shares' | 'months' | 'filterRow'>): ReactNode {
  const table = layout === 'table';
  if (table && deleteAll === null) return null;
  return (
    <View className="min-h-touch-min flex-row flex-wrap items-center justify-between gap-2 px-4">
      {table ? (
        <View />
      ) : (
        <Checkbox
          checked={pickState}
          label="Select all"
          onChange={() => {
            onToggleAll();
          }}
        />
      )}
      {deleteAll === null ? null : (
        <Button
          label="Delete all now"
          icon="trash"
          variant="destructive"
          disabled={deleteAll.disabled}
          onPress={deleteAll.onPress}
        />
      )}
    </View>
  );
}

export function TableTop(props: TableTopProps): ReactNode {
  return (
    <View className="gap-3 pb-1">
      <View className="px-gutter">
        <TrashSummary
          shares={props.shares}
          months={props.months}
          wide={props.layout !== 'compact'}
        />
      </View>
      <View className="px-gutter">{props.filterRow}</View>
      <Toolbar
        layout={props.layout}
        pickState={props.pickState}
        onToggleAll={props.onToggleAll}
        deleteAll={props.deleteAll}
      />
      {props.layout === 'table' ? (
        <ColumnHeader pickState={props.pickState} onToggleAll={props.onToggleAll} />
      ) : null}
    </View>
  );
}
