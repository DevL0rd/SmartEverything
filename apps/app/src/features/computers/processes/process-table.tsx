import type { ReactNode } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { ProcessSort } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { useAnchoredMenu } from '../../../components/menu';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import type { ProcessLayout } from './process-format';
import type { ProcessLine } from './process-lines';
import { ProcessRowView } from './process-row';
import { PROCESS_SORT_OPTIONS, sortLabel, type ProcessOrdering } from './process-sort';

export interface ProcessTableProps {
  readonly lines: readonly ProcessLine[];
  readonly layout: ProcessLayout;
  readonly tree: boolean;
  readonly ordering: ProcessOrdering;
  readonly gpuShown: boolean;
  readonly summary: string;
  readonly onSort: (sort: ProcessSort) => void;
  readonly onOpen: (key: string) => void;
  readonly onToggle: (key: string) => void;
}

interface Column {
  readonly sort: ProcessSort;
  readonly label: string;
  readonly className: string;
}

const COLUMNS: readonly Column[] = [
  { sort: 'cpu', label: 'CPU', className: 'w-18' },
  { sort: 'memory', label: 'Memory', className: 'w-21' },
  { sort: 'gpu', label: 'GPU', className: 'w-16' },
];

const WIDE_COLUMNS: readonly Column[] = [
  { sort: 'disk', label: 'Disk', className: 'w-22' },
  { sort: 'threads', label: 'Threads', className: 'w-16' },
  { sort: 'user', label: 'User', className: 'w-18' },
];

function HeaderCell({
  column,
  ordering,
  start,
  onSort,
}: {
  readonly column: { readonly sort: ProcessSort; readonly label: string };
  readonly ordering: ProcessOrdering;
  readonly start: boolean;
  readonly onSort: (sort: ProcessSort) => void;
}): ReactNode {
  const active = ordering.sort === column.sort;
  const direction = ordering.order === 'descending' ? 'descending' : 'ascending';
  return (
    <Interactive
      label={`Sort by ${column.label}${active ? `, ${direction}` : ''}`}
      selected={active}
      onPress={() => {
        onSort(column.sort);
      }}
      className={cn(
        'h-10 flex-row items-center gap-1 rounded-sm',
        start ? 'min-w-0 flex-1' : 'justify-end',
      )}
    >
      <Text variant="label" tone={active ? 'default' : 'variant'} numberOfLines={1}>
        {column.label}
      </Text>
      {active ? (
        <Icon name={ordering.order === 'descending' ? 'chevronDown' : 'chevronUp'} size={16} />
      ) : null}
    </Interactive>
  );
}

function ColumnHeader({
  layout,
  tree,
  ordering,
  onSort,
}: Pick<ProcessTableProps, 'layout' | 'tree' | 'ordering' | 'onSort'>): ReactNode {
  const columns = layout === 'full' ? [...COLUMNS, ...WIDE_COLUMNS] : COLUMNS;
  return (
    <View className="flex-row items-center gap-2 border-b border-outline-variant bg-surface-2 pl-4 pr-4">
      <View className={cn('min-w-0 flex-1 flex-row', tree ? 'pl-9' : '')}>
        <HeaderCell
          column={{ sort: 'name', label: 'Name' }}
          ordering={ordering}
          start
          onSort={onSort}
        />
      </View>
      {columns.map((column) => (
        <View key={column.sort} className={column.className}>
          <HeaderCell column={column} ordering={ordering} start={false} onSort={onSort} />
        </View>
      ))}
    </View>
  );
}

function SortMenu({
  ordering,
  summary,
  onSort,
}: Pick<ProcessTableProps, 'ordering' | 'summary' | 'onSort'>): ReactNode {
  const items = PROCESS_SORT_OPTIONS.map((option) => ({
    label: option.label,
    ...(option.value === ordering.sort ? { icon: 'check' as const } : {}),
    onPress: (): void => {
      onSort(option.value);
    },
  }));
  const { ref, open, menu } = useAnchoredMenu(items, 'Sort by');
  return (
    <View className="min-h-12 flex-row items-center justify-between gap-2 border-b border-outline-variant bg-surface-2 pl-4 pr-2">
      <Text variant="caption" tone="variant" numberOfLines={1} className="tabular min-w-0 flex-1">
        {summary}
      </Text>
      <View ref={ref} collapsable={false}>
        <Button
          label={`Sort: ${sortLabel(ordering.sort)}`}
          variant="text"
          icon={ordering.order === 'descending' ? 'chevronDown' : 'chevronUp'}
          onPress={open}
        />
        {menu}
      </View>
    </View>
  );
}

export function ProcessTable(props: ProcessTableProps): ReactNode {
  const { lines, layout, tree, gpuShown, onOpen, onToggle } = props;
  return (
    <>
      {layout === 'phone' ? (
        <SortMenu ordering={props.ordering} summary={props.summary} onSort={props.onSort} />
      ) : (
        <ColumnHeader layout={layout} tree={tree} ordering={props.ordering} onSort={props.onSort} />
      )}
      <View className="min-h-0 flex-1">
        <FlashList
          data={lines}
          keyExtractor={(line) => line.key}
          renderItem={({ item }) => (
            <ProcessRowView
              rowKey={item.key}
              row={item.row}
              depth={item.depth}
              open={item.open}
              tree={tree}
              layout={layout}
              gpuShown={gpuShown}
              onOpen={onOpen}
              onToggle={onToggle}
            />
          )}
        />
      </View>
    </>
  );
}
