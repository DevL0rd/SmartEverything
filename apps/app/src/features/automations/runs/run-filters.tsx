import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { count as formatCount } from '../../../format/number';
import { FILTER_LABELS, RUN_FILTERS, type RunFilter } from './run-history-model';

export interface RunFiltersProps {
  readonly chosen: ReadonlySet<RunFilter>;
  readonly counts: Readonly<Record<RunFilter, number>>;
  readonly onToggle: (filter: RunFilter) => void;
}

export function RunFilters({ chosen, counts, onToggle }: RunFiltersProps): ReactNode {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
      {RUN_FILTERS.map((filter) => {
        const active = chosen.has(filter);
        const label = `${FILTER_LABELS[filter]}, ${formatCount(counts[filter])}`;
        return (
          <Interactive
            key={filter}
            role="checkbox"
            label={label}
            checked={active}
            onPress={() => {
              onToggle(filter);
            }}
            className={cn(
              'h-10 flex-row items-center gap-1.5 rounded-full border px-4',
              active ? 'border-primary bg-primary-container' : 'border-outline-variant',
            )}
          >
            <Text variant="label">{FILTER_LABELS[filter]}</Text>
            <Text variant="caption" tone="variant" className="tabular">
              {formatCount(counts[filter])}
            </Text>
          </Interactive>
        );
      })}
    </ScrollView>
  );
}
