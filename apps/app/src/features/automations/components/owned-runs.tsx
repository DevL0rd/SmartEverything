import type { ReactNode } from 'react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ACTIVE_AUTOMATION_RUN_STATUSES,
  AUTOMATION_RUN_HISTORY_LIMIT,
  type AutomationRunRow,
  type AutomationRunStatus,
} from '@smarteverything/domain';
import { readOwnedRun, stopOwnedRun } from '../../../api/automation-runtime';
import { Button } from '../../../components/button';
import { ErrorState } from '../../../components/error-state';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { ValueRow } from '../../../components/rows';
import { useRows } from '../../../store/selectors';
import { RunCommand } from './run-command';
import { attempt } from '../data/actions';

const LABELS: Readonly<Record<AutomationRunStatus, string>> = {
  queued: 'Queued',
  running: 'Running',
  cancelling: 'Stopping',
  cancelled: 'Cancelled',
  succeeded: 'Completed',
  failed: 'Failed',
  interrupted: 'Interrupted',
  ignored: 'Ignored',
};

interface RunSummaryProps {
  readonly run: AutomationRunRow;
}
function RunSummary({ run }: RunSummaryProps): ReactNode {
  return (
    <>
      <List>
        <ValueRow title="Status" value={LABELS[run.status]} />
        {run.parent_run_id === null ? null : (
          <ValueRow title="Parent run" value={run.parent_run_id} />
        )}
        <ValueRow
          title="Started"
          value={
            run.started_at === null ? 'Not started' : new Date(run.started_at).toLocaleString()
          }
        />
        <ValueRow
          title="Finished"
          value={
            run.finished_at === null ? 'Not finished' : new Date(run.finished_at).toLocaleString()
          }
        />
      </List>
      <Text
        variant="footnote"
        tone="variant"
        selectable
      >{`Run ${run.id}\nSaved revision ${run.definition_revision}`}</Text>
      <Text variant="footnote" tone="variant">
        Trace uses saved node IDs. The editable program may have changed since this run.
      </Text>
      {run.error === null ? null : (
        <Text variant="callout" tone="critical" selectable>
          {run.error}
        </Text>
      )}
    </>
  );
}
function RunTrace({ run }: RunSummaryProps): ReactNode {
  const [command, setCommand] = useState<string | null>(null);
  return (
    <>
      <List title="Steps">
        {run.trace.map((step, index) => (
          <List key={`${String(index)}:${step.nodeId}`}>
            <ListRow
              title={step.nodeId}
              subtitle={[step.status, step.error].filter((text) => text !== null).join(' · ')}
              wrapSubtitle
              icon={step.status === 'failed' ? 'circleX' : 'activity'}
            />
            {step.commandIds.map((id) => (
              <ListRow
                key={id}
                title={`Command ${id}`}
                icon="activity"
                chevron
                onPress={() => {
                  setCommand(id);
                }}
              />
            ))}
          </List>
        ))}
      </List>
      <Sheet
        open={command !== null}
        title="Command outcome"
        onClose={() => {
          setCommand(null);
        }}
        detents={['fit']}
      >
        {command === null ? null : <RunCommand id={command} />}
      </Sheet>
    </>
  );
}

interface RunDetailProps {
  readonly initial: AutomationRunRow;
}

function currentRun(
  live: AutomationRunRow | null,
  stopped: AutomationRunRow | null,
  fetched: AutomationRunRow,
): AutomationRunRow {
  if (live === null) return stopped ?? fetched;
  if (
    ACTIVE_AUTOMATION_RUN_STATUSES.has(live.status) &&
    !ACTIVE_AUTOMATION_RUN_STATUSES.has(fetched.status)
  )
    return fetched;
  if (stopped === null || !ACTIVE_AUTOMATION_RUN_STATUSES.has(live.status)) return live;
  return stopped;
}

function RunDetail({ initial }: RunDetailProps): ReactNode {
  const live = useRows('automation_runs').find((row) => row.id === initial.id);
  const [stopping, setStopping] = useState(false);
  const [stopped, setStopped] = useState<AutomationRunRow | null>(null);
  const query = useQuery({
    queryKey: ['automation-run-detail', initial.id],
    queryFn: () => readOwnedRun(initial.id),
    retry: false,
    staleTime: 0,
  });
  const run = currentRun(live ?? null, stopped, query.data ?? initial);
  return (
    <>
      <RunSummary run={run} />
      {query.error === null ? null : (
        <ErrorState
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      )}
      <RunTrace run={run} />
      {ACTIVE_AUTOMATION_RUN_STATUSES.has(run.status) ? (
        <Button
          label={run.status === 'cancelling' ? 'Stopping' : 'Stop run'}
          variant="destructive"
          loading={stopping}
          disabled={run.status === 'cancelling'}
          onPress={() => {
            setStopping(true);
            void attempt('The run couldn’t be stopped', async () => {
              setStopped(await stopOwnedRun(run.id));
              await query.refetch();
            }).finally(() => {
              setStopping(false);
            });
          }}
        />
      ) : null}
      <Text variant="footnote" tone="variant">
        Already sent commands may complete after Stop.
      </Text>
    </>
  );
}

interface OwnedRunsProps {
  readonly automationId?: string | null;
  readonly targetType?: 'automation' | 'sequence';
}

interface RunRowsProps {
  readonly runs: readonly AutomationRunRow[];
  readonly automations: readonly { readonly id: string; readonly name: string }[];
  readonly sequences: readonly { readonly id: string; readonly name: string }[];
  readonly onOpen: (run: AutomationRunRow) => void;
}
function RunRows({ runs, automations, sequences, onOpen }: RunRowsProps): ReactNode {
  return (
    <List title="Program runs">
      {runs.length === 0 ? (
        <ListRow
          title="No program runs yet"
          subtitle="Starts, queued runs and results appear here live."
        />
      ) : (
        runs.map((row) => (
          <ListRow
            key={row.id}
            title={
              (row.target_type === 'sequence' ? sequences : automations).find(
                (item) => item.id === row.automation_id,
              )?.name ?? 'Deleted program'
            }
            subtitle={`${LABELS[row.status]} · ${new Date(row.created_at).toLocaleString()}`}
            icon={
              row.status === 'failed'
                ? 'circleX'
                : ACTIVE_AUTOMATION_RUN_STATUSES.has(row.status)
                  ? 'activity'
                  : 'circleCheck'
            }
            chevron
            onPress={() => {
              onOpen(row);
            }}
          />
        ))
      )}
    </List>
  );
}

export function OwnedRuns({ automationId = null, targetType }: OwnedRunsProps): ReactNode {
  const rows = useRows('automation_runs');
  const automations = useRows('automations');
  const sequences = useRows('automation_sequences');
  const [selected, setSelected] = useState<AutomationRunRow | null>(null);
  const runs = rows.filter(
    (row) =>
      (automationId === null || row.automation_id === automationId) &&
      (targetType === undefined || (row.target_type ?? 'automation') === targetType),
  );
  return (
    <>
      <RunRows runs={runs} automations={automations} sequences={sequences} onOpen={setSelected} />
      <Text
        variant="footnote"
        tone="variant"
      >{`Up to ${String(AUTOMATION_RUN_HISTORY_LIMIT)} recent owned runs are available. Earlier legacy events appear separately.`}</Text>
      <OwnedRunSheet
        run={selected}
        onClose={() => {
          setSelected(null);
        }}
      />
    </>
  );
}

interface OwnedRunSheetProps {
  readonly run: AutomationRunRow | null;
  readonly onClose: () => void;
}

export function OwnedRunSheet({ run, onClose }: OwnedRunSheetProps): ReactNode {
  return (
    <Sheet open={run !== null} title="Run details" onClose={onClose} detents={['full']}>
      {run === null ? null : <RunDetail key={run.id} initial={run} />}
    </Sheet>
  );
}
