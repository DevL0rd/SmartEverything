import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/checkbox';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useSelectionDocked } from '../../files';
import type { DeletedByShare } from './deleted-by';
import type { LeavingMonth } from './leaving-bars';
import { Icon } from '../../../components/icon';
import type { PickState } from './selection';
import { TABLE_COLUMNS, type TrashLayout } from './trash-layout';
import { TrashSummary } from './trash-summary';

export interface DeleteAll {
  readonly label: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
}

export interface TableTopProps {
  readonly layout: TrashLayout;
  readonly wide: boolean;
  readonly shares: readonly DeletedByShare[];
  readonly months: readonly LeavingMonth[];
  readonly pickState: PickState;
  readonly onToggleAll: () => void;
  readonly deleteAll: DeleteAll | null;
  readonly empty: boolean;
  readonly selection: ReactNode;
  readonly filterRow: ReactNode;
}

const SLOT = 'mx-gutter h-12 flex-row items-center';

export function DeleteAllButton({ deleteAll }: { readonly deleteAll: DeleteAll }): ReactNode {
  return (
    <Button
      label={deleteAll.label}
      icon="trash"
      variant="destructive"
      disabled={deleteAll.disabled}
      onPress={deleteAll.onPress}
    />
  );
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

function CheckMark({ state }: { readonly state: PickState }): ReactNode {
  return (
    <View
      aria-hidden
      className={cn(
        'size-5 shrink-0 items-center justify-center rounded-xs border-2',
        state === false ? 'border-on-surface-variant' : 'border-primary bg-primary',
      )}
    >
      {state === false ? null : (
        <Icon name={state === 'mixed' ? 'minus' : 'check'} size={16} tone="onPrimary" />
      )}
    </View>
  );
}

function ColumnHeader({
  pickState,
  onToggleAll,
  checkbox,
}: Pick<TableTopProps, 'pickState' | 'onToggleAll'> & { readonly checkbox: boolean }): ReactNode {
  return (
    <View className={cn(SLOT, 'pl-4 pr-1')}>
      <View className="min-w-0 flex-1 flex-row items-center gap-3">
        {checkbox ? (
          <Interactive
            role="checkbox"
            checked={pickState}
            label="Select all"
            onPress={onToggleAll}
            hitSlop={12}
            className="-mx-2.5 size-10 items-center justify-center rounded-xs"
            layerClassName="rounded-xs"
          >
            <CheckMark state={pickState} />
          </Interactive>
        ) : (
          <View className="w-5" />
        )}
        <View className="w-7" />
        <Heading text="Name" className="min-w-0 flex-1" />
        <Heading text="Was in" className={TABLE_COLUMNS.wasIn} />
        <Heading text="Deleted by" className={TABLE_COLUMNS.deletedBy} />
        <Heading text="Size" className={cn(TABLE_COLUMNS.size, 'text-right')} />
        <Heading text="Leaves in" className={TABLE_COLUMNS.leaves} />
      </View>
      <View className={TABLE_COLUMNS.actions} />
    </View>
  );
}

function InlineSelection({ selection }: { readonly selection: ReactNode }): ReactNode {
  return (
    <View className={cn(SLOT, 'pl-1 pr-3')}>
      <View className="-mb-1 min-w-0 flex-1">{selection}</View>
    </View>
  );
}

function Toolbar({
  pickState,
  onToggleAll,
  deleteAll,
  picking,
}: Pick<TableTopProps, 'pickState' | 'onToggleAll' | 'deleteAll'> & {
  readonly picking: boolean;
}): ReactNode {
  if (picking) {
    return (
      <View className={cn(SLOT, 'pl-4 pr-3')}>
        <Text variant="footnote" tone="variant" numberOfLines={1} className="min-w-0 flex-1">
          Pick more items, or use the actions below
        </Text>
      </View>
    );
  }
  return (
    <View className={cn(SLOT, 'justify-between gap-2 pl-4 pr-3')}>
      <Checkbox
        checked={pickState}
        label="Select all"
        onChange={() => {
          onToggleAll();
        }}
      />
      {deleteAll === null ? null : <DeleteAllButton deleteAll={deleteAll} />}
    </View>
  );
}

function ListTop(props: TableTopProps & { readonly docked: boolean }): ReactNode {
  const picking = props.selection !== null;
  if (props.empty) return null;
  if (props.layout === 'table') {
    return picking && !props.docked ? (
      <InlineSelection selection={props.selection} />
    ) : (
      <ColumnHeader
        pickState={props.pickState}
        onToggleAll={props.onToggleAll}
        checkbox={!picking}
      />
    );
  }
  if (picking && !props.docked) return <InlineSelection selection={props.selection} />;
  return (
    <Toolbar
      pickState={props.pickState}
      onToggleAll={props.onToggleAll}
      deleteAll={props.deleteAll}
      picking={picking}
    />
  );
}

export function TableTop(props: TableTopProps): ReactNode {
  const docked = useSelectionDocked();
  return (
    <View className="gap-3 pb-1">
      <View className="px-gutter">
        <TrashSummary shares={props.shares} months={props.months} wide={props.wide} />
      </View>
      <View className="px-gutter">{props.filterRow}</View>
      <ListTop {...props} docked={docked} />
    </View>
  );
}
