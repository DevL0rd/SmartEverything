import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import {
  NODE_REGISTRY,
  automationSentence,
  type AutomationRowV3,
  type AutomationRunSummary,
  type FunctionLookup,
  type RefNames,
} from '@smarteverything/domain';
import type { LintContext } from '@smarteverything/flow/check/lint';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { Grid } from '../../../components/grid';
import { LoadedQuery } from '../../../components/loaded-query';
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

export interface DetailEnvironment {
  readonly names: RefNames;
  readonly functions: FunctionLookup;
  readonly lint: LintContext;
  readonly timeZone: string | null;
  readonly person: PersonName;
}

export interface DetailLinks {
  readonly list: Href;
  readonly edit: EditAt;
  readonly runs: Href;
  readonly use: UseLink;
}

export interface DetailScreenProps {
  readonly automationId: string;
  readonly environment: DetailEnvironment;
  readonly links: DetailLinks;
  readonly onOpenRun: (run: AutomationRunSummary) => void;
}

interface LoadedProps extends Omit<DetailScreenProps, 'automationId'> {
  readonly row: AutomationRowV3;
  readonly revisions: ReturnType<typeof useAutomation>['revisions'];
}

function useSentence(row: AutomationRowV3, names: RefNames): string | null {
  const kindOf = useKindOf();
  return useMemo(
    () => automationSentence(row.definition, { kinds: kindOf, names }),
    [row.definition, kindOf, names],
  );
}

function Loaded({ row, revisions, environment, links, onOpenRun }: LoadedProps): ReactNode {
  const { names, functions, lint, timeZone, person } = environment;
  const actions = useListActions();
  const [showAll, setShowAll] = useState(false);
  const restore = useRestoreVersion(row);
  const manifest = useManifest(row, functions);
  const sentence = useSentence(row, names);
  const groups = useMemo(
    () => runLiveCheck(row.definition, lint, NODE_REGISTRY).groups,
    [row.definition, lint],
  );
  return (
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
      <Activity
        automationId={row.id}
        timeZone={timeZone}
        runsHref={links.runs}
        onOpenRun={onOpenRun}
      />
      <Grid minItemWidth={PANEL_MIN_WIDTH}>
        <Uses manifest={manifest} names={names} link={links.use} />
        <Problems groups={groups} editAt={links.edit} />
      </Grid>
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
