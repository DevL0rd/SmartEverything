import { runBoundToChat } from '../model/subagent-state';
import { AgentChatDelete } from './agent-chat-delete';
import { useHarnessCatalogue } from '../data/harness';
import { harnessHostName, harnessRouteLabel } from '../model/harness-context';
import { AgentMessage } from './agent-message';
import { Markdown } from './markdown/markdown';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { AiAgentRun } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { CollapseRoot, CollapseBody, TurnChevron } from './disclosure';
import { Interactive } from '../../../components/interactive';
import { Button } from '../../../components/button';
import { NavRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { useDevice, useIsOwner } from '../../../store/selectors';
import { QueryState } from '../../computers/components/query-state';
import { useAgentRun, useInterruptAgent } from '../data/agent-runs';

export const AGENT_SOURCE_LABELS = {
  smarteverything: 'SmartEverything',
  dsh: 'SmartEverything',
  claude: 'Claude',
  codex: 'Codex',
} as const;
const UNREPORTED = 'Not provided by this runtime';
function DetailText({
  title,
  value,
}: {
  readonly title: string;
  readonly value: string | null;
}): ReactNode {
  return value === null ? null : (
    <View className="gap-2">
      <Text variant="caption" tone="variant">
        {title}
      </Text>
      <Markdown text={value} selectable />
    </View>
  );
}
function AgentIdentity({ run }: { readonly run: AiAgentRun }): ReactNode {
  const device = useDevice(run.device_id ?? '');
  const status =
    run.state === 'unknown' && run.last_known_state !== null
      ? `Unknown · last known ${run.last_known_state}`
      : run.state;
  return (
    <List title="Execution">
      <ValueRow title="Engine" value={AGENT_SOURCE_LABELS[run.source]} />
      <AgentTimes run={run} status={status} />
      <HarnessAgentRoute run={run} />
      <ValueRow title="Model" value={run.model ?? UNREPORTED} />
      <ValueRow title="Thinking" value={run.effort ?? UNREPORTED} />
      <ValueRow title="Runs on" value={agentHostName(run, device?.label)} />
      <View className="gap-1 px-4 py-3">
        <Text variant="footnote" tone="variant">
          Folder
        </Text>
        <Text selectable>{run.cwd ?? UNREPORTED}</Text>
      </View>
    </List>
  );
}
function AgentUsage({ run }: { readonly run: AiAgentRun }): ReactNode {
  const usage = run.usage;
  if (usage === null) return <Text tone="variant">Usage: {UNREPORTED}</Text>;
  return (
    <List title="Reported usage">
      <ValueRow
        title="Input tokens"
        value={usage.input_tokens === null ? UNREPORTED : String(usage.input_tokens)}
      />
      <ValueRow
        title="Output tokens"
        value={usage.output_tokens === null ? UNREPORTED : String(usage.output_tokens)}
      />
      <ValueRow
        title="Total tokens"
        value={usage.total_tokens === null ? UNREPORTED : String(usage.total_tokens)}
      />
      <ValueRow
        title="Cost"
        value={usage.cost_usd === null ? UNREPORTED : `${usage.cost_usd.toFixed(4)} USD`}
      />
      <ValueRow
        title="Tool calls"
        value={usage.tool_uses === null ? UNREPORTED : String(usage.tool_uses)}
      />
      <ValueRow
        title="Duration"
        value={
          usage.duration_ms === null
            ? UNREPORTED
            : `${String(Math.round(usage.duration_ms / 1000))} s`
        }
      />
    </List>
  );
}
function AgentActions({
  run,
  onDeleted,
}: {
  readonly run: AiAgentRun;
  readonly onDeleted: () => void;
}): ReactNode {
  const owner = useIsOwner();
  const interrupt = useInterruptAgent(run.parent_chat_id, run.id);
  return (
    <View className="gap-3">
      {run.child_chat_id === null ? null : (
        <NavRow title="Open child chat" href={href.assistantChat(run.child_chat_id)} />
      )}
      <AgentChatDelete run={run} onDeleted={onDeleted} />
      {run.parent_run_id === null ? null : (
        <NavRow
          title="Parent agent"
          href={href.assistantChat(run.parent_chat_id, {
            sheet: 'chat',
            agent: run.parent_run_id,
          })}
        />
      )}
      {run.supported_actions.includes('interrupt') &&
      (owner || run.source === 'smarteverything' || run.source === 'dsh') ? (
        <Button
          label="Interrupt agent"
          variant="tonal"
          loading={interrupt.isPending}
          onPress={() => {
            interrupt.mutate();
          }}
        />
      ) : null}
    </View>
  );
}
function AgentResult({
  run,
  onDeleted,
}: {
  readonly run: AiAgentRun;
  readonly onDeleted: () => void;
}): ReactNode {
  return (
    <View className="gap-section-gap">
      <DetailText title="Objective" value={run.task} />
      <DetailText title="Latest progress" value={run.progress} />
      <DetailText title="Result" value={run.result} />
      <DetailText title="Error" value={run.error} />
      {run.truncated ? (
        <Text tone="warning">This runtime’s retained output is truncated.</Text>
      ) : null}
      <AgentActions run={run} onDeleted={onDeleted} />
      <AgentMessage run={run} />
      <AgentContext run={run} />
    </View>
  );
}
export function AgentDetails({
  chatId,
  agentRunId,
  onDeleted,
  childChatId,
}: {
  readonly childChatId?: string;
  readonly chatId: string;
  readonly agentRunId: string;
  readonly onDeleted: () => void;
}): ReactNode {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const detail = useAgentRun(chatId, agentRunId, cursor);
  return (
    <View className="gap-section-gap">
      <QueryState
        error={detail.error}
        pending={detail.isPending}
        retry={() => {
          void detail.refetch();
        }}
      />
      {detail.data === undefined ? null : !runBoundToChat(detail.data.run, chatId, childChatId) ? (
        <Text tone="variant">This run belongs to another chat.</Text>
      ) : (
        <>
          <Text variant="title-3">{detail.data.run.title}</Text>
          <AgentResult run={detail.data.run} onDeleted={onDeleted} />
          <AgentTrace detail={detail.data} setCursor={setCursor} />
          {detail.data.truncated ? (
            <Text tone="warning">Published activity is truncated.</Text>
          ) : null}
        </>
      )}
    </View>
  );
}

function AgentTimes({
  run,
  status,
}: {
  readonly run: AiAgentRun;
  readonly status: string;
}): ReactNode {
  return (
    <>
      <ValueRow title="Status" value={status} />
      <ValueRow
        title="Started"
        value={run.started_at === null ? UNREPORTED : new Date(run.started_at).toLocaleString()}
      />
      <ValueRow
        title="Finished"
        value={run.completed_at === null ? UNREPORTED : new Date(run.completed_at).toLocaleString()}
      />
    </>
  );
}

function AgentTrace({
  detail,
  setCursor,
}: {
  readonly detail: NonNullable<ReturnType<typeof useAgentRun>['data']>;
  readonly setCursor: (value: string | undefined) => void;
}): ReactNode {
  return (
    <>
      {detail.trace.length === 0 ? null : (
        <View className="gap-3">
          <Text variant="title-3">Published activity</Text>
          {detail.trace.map((entry) => (
            <View key={entry.seq} className="gap-1">
              <Text variant="footnote" tone="variant">
                {entry.kind} · {new Date(entry.created_at).toLocaleString()}
              </Text>
              <Text selectable>{entry.text}</Text>
            </View>
          ))}
        </View>
      )}
      {detail.next_cursor === null ? null : (
        <Button
          label="Next activity page"
          variant="tonal"
          onPress={() => {
            setCursor(detail.next_cursor ?? undefined);
          }}
        />
      )}
    </>
  );
}

function HarnessAgentRoute({ run }: { readonly run: AiAgentRun }): ReactNode {
  const catalogue = useHarnessCatalogue();
  const harness = run.harness;
  if (harness === undefined) return null;
  const route = catalogue.data?.routes.find((row) => row.id === harness.model_route_id);
  return (
    <>
      <ValueRow title="Origin host" value={harnessHostName(harness.target, catalogue.data)} />
      <ValueRow
        title="Model supplier"
        value={
          route === undefined ? 'Supplier unavailable' : harnessRouteLabel(route, catalogue.data)
        }
      />
    </>
  );
}

function agentHostName(run: AiAgentRun, deviceName: string | undefined): string {
  if (run.harness?.target.kind === 'server') return 'Home hub';
  if (run.device_id === null) return UNREPORTED;
  return deviceName ?? 'Computer unavailable';
}

function AgentContext({ run }: { readonly run: AiAgentRun }): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <CollapseRoot className="gap-2">
      <Interactive
        label={open ? 'Hide agent details' : 'Show agent details'}
        onPress={() => {
          setOpen(!open);
        }}
        className="min-h-touch-min flex-row items-center justify-between rounded-sm px-2"
      >
        <Text variant="label">Details and usage</Text>
        <TurnChevron open={open} />
      </Interactive>
      {open ? (
        <CollapseBody className="gap-3">
          <AgentIdentity run={run} />
          <AgentUsage run={run} />
          <DetailText title="Report availability" value={run.observability_reason} />
        </CollapseBody>
      ) : null}
    </CollapseRoot>
  );
}
