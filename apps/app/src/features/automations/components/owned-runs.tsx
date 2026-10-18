import type { ReactNode } from 'react';
import { memo, useState } from 'react';
import { useScreenQuery } from '../../../queries/use-screen-query';
import type { AutomationRunRow } from '@smarteverything/domain';
import { readOwnedRun, stopOwnedRun } from '../../../api/automation-runtime';
import { Button } from '../../../components/button';
import { Disclosure } from '../../../components/disclosure';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { PAGE_SIZE, ShowMore } from '../../../components/show-more';
import { Text } from '../../../components/text';
import { ValueRow } from '../../../components/rows';
import { dayLabel, moment } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useRow, useRows } from '../../../store/selectors';
import { attempt } from '../data/actions';
import { useCatalog, usePlaceReading } from '../data/use-automations';
import {
  RUN_LABELS,
  isActive,
  newestFirst,
  runDays,
  runLook,
  stepTitle,
  tookMs,
} from '../model/run-history';
import { storedAutomationOf } from '../model/reusable-steps';
import { durationText } from '../model/describe-values';
import { RunCommand } from './run-command';
import { background } from '@smarteverything/logging';

const STEP_ICONS = {
  running: 'activity',
  succeeded: 'circleCheck',
  failed: 'circleX',
  cancelled: 'ban',
} as const;

export function useZone(): string | null {
  const reading = usePlaceReading();
  return reading.usable ? reading.place.timeZone : null;
}

function currentRun(
  live: AutomationRunRow | null,
  stopped: AutomationRunRow | null,
  fetched: AutomationRunRow,
): AutomationRunRow {
  if (live === null) return stopped ?? fetched;
  if (isActive(live.status) && !isActive(fetched.status)) return fetched;
  if (stopped === null || !isActive(live.status)) return live;
  return stopped;
}

function RunSummary({
  run,
  zone,
}: {
  readonly run: AutomationRunRow;
  readonly zone: string | null;
}): ReactNode {
  const now = useMinute();
  const took = tookMs(run);
  return (
    <>
      <List>
        <ValueRow title="Result" value={RUN_LABELS[run.status]} />
        <ValueRow
          title="Started"
          value={run.started_at === null ? 'Not started' : moment(run.started_at, now, zone)}
        />
        {took === null ? null : <ValueRow title="Took" value={durationText(took)} />}
      </List>
      {run.error === null ? null : (
        <Text variant="callout" tone="critical" selectable>
          {run.error}
        </Text>
      )}
    </>
  );
}

function StepRows({
  run,
  onOpenCommand,
}: {
  readonly run: AutomationRunRow;
  readonly onOpenCommand: (id: string) => void;
}): ReactNode {
  const names = useCatalog().names;
  const row = useRow('automations', run.automation_id);
  const automation = row === null ? null : storedAutomationOf(row);
  return (
    <List title="Steps">
      {run.trace.map((step, index) => (
        <List key={`${String(index)}:${step.nodeId}`}>
          <ListRow
            title={stepTitle(names, automation, step.nodeId)}
            wrapSubtitle
            {...(step.error === null
              ? {}
              : { subtitle: step.error, subtitleTone: 'critical' as const })}
            icon={STEP_ICONS[step.status]}
            iconTone={step.status === 'failed' ? 'critical' : 'variant'}
          />
          {step.commandIds.map((id) => (
            <ListRow
              key={id}
              title="Command sent"
              icon="activity"
              chevron
              onPress={() => {
                onOpenCommand(id);
              }}
            />
          ))}
        </List>
      ))}
    </List>
  );
}

function RunTrace({ run }: { readonly run: AutomationRunRow }): ReactNode {
  const [command, setCommand] = useState<string | null>(null);
  return (
    <>
      <StepRows run={run} onOpenCommand={setCommand} />
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

function RunDetails({ run }: { readonly run: AutomationRunRow }): ReactNode {
  const [open, setOpen] = useState(false);
  const program = useRow('automations', run.automation_id);
  return (
    <Disclosure
      label="Details"
      hint="Shows technical details of this run"
      open={open}
      onToggle={() => {
        setOpen(!open);
      }}
    >
      <Text variant="footnote" tone="variant" selectable>
        {`Run ${run.id}\nSaved revision ${String(run.revision)}${run.parent_run_id === null ? '' : `\nStarted by run ${run.parent_run_id}`}`}
      </Text>
      {program === null || program.revision === run.revision ? null : (
        <Text variant="footnote" tone="variant">
          This run used an earlier version of the automation.
        </Text>
      )}
    </Disclosure>
  );
}

function stopRun(
  run: AutomationRunRow,
  setStopped: (row: AutomationRunRow) => void,
  refetch: () => Promise<unknown>,
): Promise<boolean> {
  return attempt(
    'The run couldn’t be stopped',
    async () => {
      setStopped(await stopOwnedRun(run.id));
      await refetch();
    },
    { action: 'stop-run', runId: run.id, status: run.status },
  );
}

function RunDetail({ initial }: { readonly initial: AutomationRunRow }): ReactNode {
  const live = useRow('automation_runs', initial.id);
  const zone = useZone();
  const [stopping, setStopping] = useState(false);
  const [stopped, setStopped] = useState<AutomationRunRow | null>(null);
  const query = useScreenQuery({
    queryKey: ['automation-run-detail', initial.id],
    queryFn: () => readOwnedRun(initial.id),
    retry: false,
    staleTime: 0,
  });
  const run = currentRun(live ?? null, stopped, query.data ?? initial);
  return (
    <>
      <RunSummary run={run} zone={zone} />
      {query.error === null ? null : (
        <ErrorState
          error={query.error}
          retry={() => {
            background(query.refetch(), 'query.refetch_failed');
          }}
        />
      )}
      <RunTrace run={run} />
      {isActive(run.status) ? (
        <>
          <Button
            label={run.status === 'cancelling' ? 'Stopping' : 'Stop run'}
            variant="destructive"
            loading={stopping}
            disabled={run.status === 'cancelling'}
            onPress={() => {
              setStopping(true);
              background(
                stopRun(run, setStopped, query.refetch).finally(() => {
                  setStopping(false);
                }),
                'run.stop_failed',
              );
            }}
          />
          <Text variant="footnote" tone="variant">
            Commands already sent may still finish.
          </Text>
        </>
      ) : null}
      <RunDetails run={run} />
    </>
  );
}

interface RunItemProps {
  readonly row: AutomationRunRow;
  readonly name: string | null;
  readonly zone: string | null;
  readonly now: number;
  readonly onOpen: (run: AutomationRunRow) => void;
}

export const RunItem = memo(function RunItem({
  row,
  name,
  zone,
  now,
  onOpen,
}: RunItemProps): ReactNode {
  const look = runLook(row.status);
  const when = moment(row.created_at, now, zone);
  return (
    <ListRow
      title={name ?? RUN_LABELS[row.status]}
      subtitle={name === null ? when : `${RUN_LABELS[row.status]} · ${when}`}
      subtitleTone={
        row.status === 'failed' || row.status === 'interrupted' ? 'critical' : 'variant'
      }
      icon={look.icon}
      iconTone={look.tone}
      chevron
      onPress={() => {
        onOpen(row);
      }}
    />
  );
});

function RunDays({
  runs,
  names,
  onOpen,
}: {
  readonly runs: readonly AutomationRunRow[];
  readonly names: ReadonlyMap<string, string> | null;
  readonly onOpen: (run: AutomationRunRow) => void;
}): ReactNode {
  const zone = useZone();
  const now = useMinute();
  return (
    <>
      {runDays(runs, zone).map((day) => (
        <List key={day.key} title={dayLabel(day.first.created_at, now, zone)} inset>
          {day.runs.map((row) => (
            <RunItem
              key={row.id}
              row={row}
              name={names === null ? null : (names.get(row.automation_id) ?? 'Deleted automation')}
              zone={zone}
              now={now}
              onOpen={onOpen}
            />
          ))}
        </List>
      ))}
    </>
  );
}

export function OwnedRuns({
  automationId = null,
}: {
  readonly automationId?: string | null;
}): ReactNode {
  const rows = useRows('automation_runs');
  const automations = useRows('automations');
  const [selected, setSelected] = useState<AutomationRunRow | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const runs = newestFirst(
    rows.filter((row) => automationId === null || row.automation_id === automationId),
  );
  const names =
    automationId === null ? new Map(automations.map((item) => [item.id, item.name])) : null;
  return (
    <>
      {runs.length === 0 ? (
        <EmptyState
          icon="activity"
          title="No runs yet"
          body="Every time an automation runs, it shows up here with what happened."
        />
      ) : (
        <>
          <RunDays runs={runs.slice(0, limit)} names={names} onOpen={setSelected} />
          <ShowMore
            remaining={runs.length - limit}
            onPress={() => {
              setLimit(limit + PAGE_SIZE);
            }}
          />
        </>
      )}
      <OwnedRunSheet
        run={selected}
        onClose={() => {
          setSelected(null);
        }}
      />
    </>
  );
}

export function OwnedRunSheet({
  run,
  onClose,
}: {
  readonly run: AutomationRunRow | null;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet open={run !== null} title="What happened" onClose={onClose} detents={['full']}>
      {run === null ? null : <RunDetail key={run.id} initial={run} />}
    </Sheet>
  );
}
