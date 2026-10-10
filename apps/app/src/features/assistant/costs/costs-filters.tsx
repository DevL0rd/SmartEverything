import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { UsageChoices } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { ChoiceChip } from '../../../components/choice-chip';
import { FilterChip } from '../../../components/filter-chip';
import { DIMENSION_INFO, partTitle } from './costs-dimensions';
import { DIMENSIONS, isFiltered, type CostDimension, type CostParamsState } from './costs-params';
import { rangeLabel, type CostWindow } from './costs-range';
import { RangeSheet } from './range-sheet';

const ALL = '*';

function DimensionChip({
  dimension,
  choices,
  state,
}: {
  readonly dimension: CostDimension;
  readonly choices: UsageChoices;
  readonly state: CostParamsState;
}): ReactNode {
  const info = DIMENSION_INFO[dimension];
  const options = choices[info.split].map((part) => ({ value: part.key, label: partTitle(part) }));
  return (
    <ChoiceChip
      label={info.label}
      icon={info.icon}
      options={[{ value: ALL, label: info.all }, ...options]}
      value={state.params[dimension] ?? ALL}
      all={ALL}
      onChange={(picked) => {
        state.set({ [dimension]: picked === ALL ? undefined : picked });
      }}
    />
  );
}

function DateChip({
  state,
  window,
  today,
}: {
  readonly state: CostParamsState;
  readonly window: CostWindow;
  readonly today: string;
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <FilterChip
        label="Dates"
        value={rangeLabel(state.params, window)}
        icon="calendar"
        active={state.params.range !== '30d'}
        onPress={() => {
          setOpen(true);
        }}
      />
      <RangeSheet
        open={open}
        range={state.params.range}
        window={window}
        today={today}
        onClose={() => {
          setOpen(false);
        }}
        onPick={(choice) => {
          state.set({ range: choice.range, from: choice.from, to: choice.to });
        }}
      />
    </>
  );
}

export interface CostFiltersProps {
  readonly state: CostParamsState;
  readonly choices: UsageChoices | undefined;
  readonly window: CostWindow;
  readonly today: string;
}

export function CostFilters({ state, choices, window, today }: CostFiltersProps): ReactNode {
  const shown = DIMENSIONS.filter(
    (dimension) =>
      state.params[dimension] !== undefined ||
      (choices !== undefined && choices[DIMENSION_INFO[dimension].split].length > 1),
  );
  return (
    <View className="flex-row flex-wrap items-center gap-2" accessibilityRole="toolbar">
      <DateChip state={state} window={window} today={today} />
      {choices === undefined
        ? null
        : shown.map((dimension) => (
            <DimensionChip key={dimension} dimension={dimension} choices={choices} state={state} />
          ))}
      {isFiltered(state.params) ? (
        <Button label="Clear" variant="text" icon="close" onPress={state.clear} />
      ) : null}
    </View>
  );
}
