import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { AppHref } from '../../../components/app-href';
import {
  automationSentence,
  type AutomationRunSummary,
  type FunctionLookup,
  type RefNames,
} from '@smarteverything/domain';
import type { AutomationRow } from '../data/graph-adapter';
import type { LintContext } from '@smarteverything/flow/check/lint';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { Grid } from '../../../components/grid';
import { LoadedQuery } from '../../../components/loaded-query';
import { useAutomationsSource } from '../data/source';
import { useAutomation } from '../data/use-automation';
import { runLiveCheck } from '../editor/problems/problem-model';
import { useListActions } from '../list/list-actions';
import { Activity } from './activity';
import { versionRows, type PersonName } from './detail-model';
import { Hero } from './hero';
import { Preview } from './preview';
import { Problems, type EditAt } from './problems';
import { useKindOf, useManifest, useRestoreVersion } from './use-detail-data';
import { Uses, type UseLink } from './uses';
import { Versions } from './versions';

const PANEL_MIN_WIDTH = 320;
const COLUMN_MIN_WIDTH = 360;

export interface DetailEnvironment {
  readonly names: RefNames;
  readonly functions: FunctionLookup;
  readonly lint: LintContext;
  readonly timeZone: string | null;
  readonly person: PersonName;
}

export interface DetailLinks {
  readonly list: AppHref;
  readonly edit: EditAt;
  readonly runs: AppHref;
  readonly use: UseLink;
}

export interface DetailScreenProps {
  readonly automationId: string;
  readonly environment: DetailEnvironment;
  readonly links: DetailLinks;
  readonly onOpenRun: (run: AutomationRunSummary) => void;
}

interface LoadedProps extends Omit<DetailScreenProps, 'automationId'> {
  readonly row: AutomationRow;
  readonly revisions: ReturnType<typeof useAutomation>['revisions'];
}

function useSentence(row: AutomationRow, names: RefNames): string | null {
  const kindOf = useKindOf();
  return useMemo(
    () => automationSentence(row.definition, { kinds: kindOf, names }),
    [row.definition, kindOf, names],
  );
}

function useProblemGroups(
  row: AutomationRow,
  lint: LintContext,
): ReturnType<typeof runLiveCheck>['groups'] {
  const { lookup } = useAutomationsSource();
  return useMemo(() => runLiveCheck(row.graph, lint, lookup).groups, [row.graph, lint, lookup]);
}

function Diagnostics({
  row,
  environment,
  links,
}: Pick<LoadedProps, 'row' | 'environment' | 'links'>): ReactNode {
  const { names, functions, lint } = environment;
  const manifest = useManifest(row, functions);
  const groups = useProblemGroups(row, lint);
  return (
    <Grid minItemWidth={PANEL_MIN_WIDTH}>
      <Uses manifest={manifest} names={names} link={links.use} />
      <Problems groups={groups} editAt={links.edit} />
    </Grid>
  );
}

function Loaded({ row, revisions, environment, links, onOpenRun }: LoadedProps): ReactNode {
  const { names, timeZone, person } = environment;
  const actions = useListActions();
  const [showAll, setShowAll] = useState(false);
  const restore = useRestoreVersion(row);
  const sentence = useSentence(row, names);
  return (
    <Grid minItemWidth={COLUMN_MIN_WIDTH} maxColumns={3}>
      <View className="gap-section-gap">
        <Hero
          row={row}
          sentence={sentence}
          timeZone={timeZone}
          edit={links.edit(null)}
          actions={actions}
          onShowVersions={() => {
            setShowAll(true);
          }}
        />
        <Preview row={row} names={names} />
      </View>
      <Activity
        automationId={row.id}
        timeZone={timeZone}
        runsHref={links.runs}
        onOpenRun={onOpenRun}
      />
      <View className="gap-section-gap">
        <Diagnostics row={row} environment={environment} links={links} />
        <LoadedQuery query={revisions}>
          {(list) => (
            <Versions
              automationId={row.id}
              versions={versionRows(list, row.revision, person)}
              live={row.revision}
              timeZone={timeZone}
              showAll={showAll}
              onShowAll={setShowAll}
              onRestore={restore}
            />
          )}
        </LoadedQuery>
      </View>
    </Grid>
  );
}

export function DetailScreen({ automationId, ...rest }: DetailScreenProps): ReactNode {
  const { row, revisions } = useAutomation(automationId);
  if (row === null) {
    return (
      <EmptyState
        icon="automations"
        title="Automation not found"
        body="It may have been deleted."
        action={<Button label="All automations" href={rest.links.list} />}
      />
    );
  }
  return <Loaded row={row} revisions={revisions} {...rest} />;
}
