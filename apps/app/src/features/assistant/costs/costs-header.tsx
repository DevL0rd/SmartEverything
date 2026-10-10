import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { UsageSummary } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Grid } from '../../../components/grid';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useIsOwner } from '../../../store/selectors';
import { BudgetMeter } from './budget-meter';
import { CostBreakdowns } from './costs-breakdowns';
import { CostChart } from './costs-chart';
import { CreditsWidget } from './costs-credits';
import { useCostChoices } from './costs-data';
import { CostFilters } from './costs-filters';
import { isFiltered, type CostParamsState } from './costs-params';
import { rangeLabel, type CostWindow } from './costs-range';
import { SummaryTiles } from './costs-summary';
import { UntrackedNote } from './untracked-note';

export interface CostsHeaderProps {
  readonly state: CostParamsState;
  readonly window: CostWindow;
  readonly today: string;
  readonly summary: UsageSummary | undefined;
  readonly summaryError: unknown;
  readonly retry: () => void;
}

function Loading(): ReactNode {
  return (
    <View className="gap-grid-gap">
      <Grid minItemWidth={200}>
        <Skeleton shape="tile" />
        <Skeleton shape="tile" />
        <Skeleton shape="tile" />
      </Grid>
      <Skeleton shape="block" className="h-60" />
    </View>
  );
}

function NothingYet({ state }: { readonly state: CostParamsState }): ReactNode {
  const narrowed = isFiltered(state.params) || state.params.range !== '30d';
  return narrowed ? (
    <EmptyState
      icon="filter"
      title="Nothing spent here"
      body="No AI requests match these dates and filters."
      action={<Button label="Show the last 30 days" variant="tonal" onPress={state.reset} />}
    />
  ) : (
    <EmptyState
      icon="gauge"
      title="No AI costs yet"
      body="Every chat, call and helper's cost shows up here: by chat, person, model and day."
      action={<Button label="Open the assistant" variant="tonal" href={href.assistantChat()} />}
    />
  );
}

function Body({
  state,
  window,
  summary,
}: CostsHeaderProps & { readonly summary: UsageSummary }): ReactNode {
  const owner = useIsOwner();
  return (
    <>
      <Grid minItemWidth={200} maxColumns={5}>
        <SummaryTiles
          summary={summary}
          window={window}
          rangeName={rangeLabel(state.params, window)}
        />
        {owner ? <CreditsWidget /> : null}
        <BudgetMeter />
      </Grid>
      {owner ? <UntrackedNote /> : null}
      <CostChart series={summary.series} window={window} />
      <CostBreakdowns
        window={window}
        filters={state.params}
        onFilter={(dimension, key) => {
          state.set({ [dimension]: key });
        }}
      />
      <Text variant="title-3" className="pt-2">
        Requests
      </Text>
    </>
  );
}

function Content(props: CostsHeaderProps): ReactNode {
  const { summary } = props;
  if (props.summaryError !== null) {
    return <ErrorState error={props.summaryError} retry={props.retry} />;
  }
  if (summary === undefined) {
    return <Loading />;
  }
  if (summary.totals.sum.count === 0) {
    return <NothingYet state={props.state} />;
  }
  return <Body {...props} summary={summary} />;
}

export function CostsHeader(props: CostsHeaderProps): ReactNode {
  const choices = useCostChoices(props.window);
  return (
    <View className="w-full gap-section-gap self-center px-gutter pb-3 max-w-dashboard">
      <CostFilters
        state={props.state}
        choices={choices.data}
        window={props.window}
        today={props.today}
      />
      <Content {...props} />
    </View>
  );
}
