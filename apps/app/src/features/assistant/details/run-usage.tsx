import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { AiAgentRun, AiHarnessCatalogue } from '@smarteverything/domain';
import { CollapseBody, CollapseRoot, TurnChevron } from '../../../components/disclosure';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { useDevice } from '../../../store/selectors';
import { useHarnessCatalogue } from '../data/harness';
import { harnessHostName, harnessRouteLabel } from '../model/harness-context';
import { runStateLabel } from './run-state';
import { useMoment } from './use-moment';

const UNREPORTED = 'Not provided by this runtime';

const ENGINE_LABEL = {
  smarteverything: 'SmartEverything',
  dsh: 'SmartEverything',
  claude: 'Claude',
  codex: 'Codex',
} as const;

const reported = (value: number | null, format: (value: number) => string): string =>
  value === null ? UNREPORTED : format(value);

function usageSummary(usage: AiAgentRun['usage']): string | undefined {
  if (usage === null) return undefined;
  if (usage.total_tokens === null) return undefined;
  const tokens = `${count(usage.total_tokens)} tokens`;
  return usage.cost_usd === null ? tokens : `${tokens} · $${usage.cost_usd.toFixed(2)}`;
}

function hostName(
  run: AiAgentRun,
  deviceName: string | undefined,
  catalogue: AiHarnessCatalogue | undefined,
): string {
  if (run.harness !== undefined) return harnessHostName(run.harness.target, catalogue);
  if (run.device_id === null) return UNREPORTED;
  return deviceName ?? 'Computer unavailable';
}

interface Fact {
  readonly key: string;
  readonly title: string;
  readonly value: string;
}

function planName(run: AiAgentRun, catalogue: AiHarnessCatalogue | undefined): string | null {
  const harness = run.harness;
  if (harness === undefined) return null;
  const route = catalogue?.routes.find((row) => row.id === harness.model_route_id);
  return route === undefined ? 'Plan unknown' : harnessRouteLabel(route, catalogue);
}

function factsOf(
  run: AiAgentRun,
  host: string,
  plan: string | null,
  when: (at: string) => string,
): readonly Fact[] {
  const at = (iso: string | null): string => (iso === null ? UNREPORTED : when(iso));
  return [
    { key: 'engine', title: 'Engine', value: ENGINE_LABEL[run.source] },
    { key: 'status', title: 'Status', value: runStateLabel(run) },
    { key: 'started', title: 'Started', value: at(run.started_at) },
    { key: 'finished', title: 'Finished', value: at(run.completed_at) },
    ...(plan === null ? [] : [{ key: 'plan', title: 'Plan', value: plan }]),
    { key: 'model', title: 'Model', value: run.model ?? UNREPORTED },
    { key: 'thinking', title: 'Thinking', value: run.effort ?? UNREPORTED },
    { key: 'host', title: 'Runs on', value: host },
  ];
}

function IdentityRows({ run }: { readonly run: AiAgentRun }): ReactNode {
  const device = useDevice(run.device_id ?? '');
  const catalogue = useHarnessCatalogue().data;
  const when = useMoment();
  const host = hostName(run, device?.label, catalogue);
  return (
    <List title="Execution">
      {[
        ...factsOf(run, host, planName(run, catalogue), when).map((fact) => (
          <ListRow key={fact.key} title={fact.title} value={fact.value} />
        )),
        <ListRow key="folder" title="Folder" subtitle={run.cwd ?? UNREPORTED} wrapSubtitle />,
      ]}
    </List>
  );
}

function UsageRows({ usage }: { readonly usage: NonNullable<AiAgentRun['usage']> }): ReactNode {
  const number = (value: number | null): string => reported(value, count);
  return (
    <List title="Reported usage">
      <ListRow title="Input tokens" value={number(usage.input_tokens)} />
      <ListRow title="Output tokens" value={number(usage.output_tokens)} />
      <ListRow title="Total tokens" value={number(usage.total_tokens)} />
      <ListRow title="Cost" value={reported(usage.cost_usd, (usd) => `${usd.toFixed(4)} USD`)} />
      <ListRow title="Tool calls" value={number(usage.tool_uses)} />
      <ListRow
        title="Duration"
        value={reported(usage.duration_ms, (ms) => `${String(Math.round(ms / 1000))} s`)}
      />
    </List>
  );
}

export function RunUsage({ run }: { readonly run: AiAgentRun }): ReactNode {
  const [open, setOpen] = useState(false);
  const summary = usageSummary(run.usage);
  return (
    <CollapseRoot className="gap-3">
      <List>
        <ListRow
          title="Details and usage"
          {...(summary === undefined ? {} : { value: summary })}
          trailing={<TurnChevron open={open} />}
          label={open ? 'Hide details and usage' : 'Show details and usage'}
          onPress={() => {
            setOpen(!open);
          }}
        />
      </List>
      {open ? (
        <CollapseBody className="gap-section-gap">
          <IdentityRows run={run} />
          {run.usage === null ? (
            <Text tone="variant" className="px-4">{`Usage: ${UNREPORTED}`}</Text>
          ) : (
            <UsageRows usage={run.usage} />
          )}
          {run.observability_reason === null ? null : (
            <View className="gap-1 px-4">
              <Text variant="caption" tone="variant">
                Report availability
              </Text>
              <Text variant="footnote">{run.observability_reason}</Text>
            </View>
          )}
        </CollapseBody>
      ) : null}
    </CollapseRoot>
  );
}
