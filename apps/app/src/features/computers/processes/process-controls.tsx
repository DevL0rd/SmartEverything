import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ChoiceChip } from '../../../components/choice-chip';
import { SearchField } from '../../../components/search-field';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { count, decimal } from '../../../format/number';
import { useComputerSelect } from '../data/computer-metrics';
import { PROCESS_FILTERS, type ProcessFilter } from './process-sort';

export type ProcessView = 'tree' | 'list';

const VIEWS = [
  { value: 'tree', label: 'Tree' },
  { value: 'list', label: 'List' },
] as const;

function Headline({ deviceId }: { readonly deviceId: string }): ReactNode {
  const total = useComputerSelect(deviceId, (parts) => parts.processes?.total ?? null);
  const load = useComputerSelect(deviceId, (parts) =>
    parts.summary === undefined ? null : Math.round(parts.summary.cpuLoad),
  );
  const text =
    total === null
      ? 'Reading processes'
      : `${count(total)} running${load === null ? '' : ` · ${decimal(load)} % CPU`}`;
  return (
    <Text variant="body-strong" numberOfLines={1} className="tabular min-w-0 flex-1">
      {text}
    </Text>
  );
}

interface ControlsProps {
  readonly deviceId: string;
  readonly view: ProcessView;
  readonly onView: (view: ProcessView) => void;
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly filter: ProcessFilter;
  readonly onFilter: (filter: ProcessFilter) => void;
  readonly flat: boolean;
  readonly shown: number;
  readonly total: number;
}

function FilterRow({
  filter,
  onFilter,
  flat,
  shown,
  total,
}: Pick<ControlsProps, 'filter' | 'onFilter' | 'flat' | 'shown' | 'total'>): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <ChoiceChip
        label="Show"
        icon="filter"
        options={PROCESS_FILTERS}
        value={filter}
        all="all"
        onChange={onFilter}
      />
      {flat ? (
        <Text variant="footnote" tone="variant" className="tabular">
          {`${count(shown)} of ${count(total)} shown as a list`}
        </Text>
      ) : null}
    </View>
  );
}

export function ProcessControls(props: ControlsProps): ReactNode {
  const { deviceId, view, onView, query, onQuery, flat } = props;
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <Headline deviceId={deviceId} />
        <Segmented
          label="View"
          value={flat ? 'list' : view}
          onChange={onView}
          disabled={flat}
          options={VIEWS}
        />
      </View>
      <SearchField
        value={query}
        onChange={onQuery}
        placeholder="Search name, command or PID"
        variant="field"
      />
      <FilterRow {...props} />
    </View>
  );
}
