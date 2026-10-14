import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AiAgentRun } from '@smarteverything/domain';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useIsOwner, useRow } from '../../../store/selectors';
import { CollapseBody, CollapseRoot, TurnChevron } from '../components/disclosure';
import { useCurrentChildRuns } from '../data/agent-runs';
import { useDeleteInactiveChats } from '../data/delete-inactive-chats';
import { inactiveChild } from '../model/subagent-state';
import { isComputerEngine } from '../provider/computer-engine';
import { ChatRow } from './chat-row';
import type { ChatRowItem } from './chat-entry';

interface SubagentRowsProps {
  readonly parentId: string;
  readonly rows: readonly ChatRowItem[];
  readonly selected: string | null;
  readonly timeZone: string | null;
  readonly onOpen: (id: string) => void;
  readonly onDeleted: (id: string) => void;
  readonly expandedInactives: ReadonlySet<string>;
  readonly onToggleInactive: (id: string) => void;
}

function InactiveHeader({
  count,
  open,
  onToggle,
  runs,
  parentId,
  onDeleted,
}: {
  readonly count: number;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly runs: readonly AiAgentRun[];
  readonly parentId: string;
  readonly onDeleted: (id: string) => void;
}): ReactNode {
  const owner = useIsOwner();
  const parent = useRow('ai_chats', parentId);
  const deletion = useDeleteInactiveChats(parentId, onDeleted);
  const allowed = parent !== null && (!isComputerEngine(parent.engine) || owner);
  return (
    <View className="flex-row items-center gap-1 px-gutter">
      <View aria-hidden className="w-6" />
      <Interactive
        label={`${open ? 'Collapse' : 'Expand'} ${String(count)} inactive subagents`}
        onPress={onToggle}
        className="min-h-touch-min min-w-0 flex-1 flex-row items-center gap-1.5 rounded-sm px-1"
        layerClassName="rounded-sm"
      >
        <TurnChevron open={open} />
        <Text variant="caption" tone="variant">{`Inactive · ${String(count)}`}</Text>
      </Interactive>
      {allowed ? (
        <Interactive
          label={`Delete all ${String(count)} inactive subagent chats`}
          disabled={deletion.isPending}
          onPress={() => {
            deletion.mutate(runs);
          }}
          className="min-h-touch-min justify-center rounded-sm px-2"
          layerClassName="rounded-sm"
        >
          <Text variant="caption" tone="critical">
            {deletion.isPending ? 'Deleting…' : 'Delete all'}
          </Text>
        </Interactive>
      ) : null}
    </View>
  );
}

export function SubagentRows(props: SubagentRowsProps): ReactNode {
  const query = useCurrentChildRuns(props.parentId);
  const runs =
    query.isSuccess && !query.hasNextPage && !query.isFetching
      ? query.data.pages.flatMap((page) => page.runs)
      : [];
  const inactive = props.rows.filter((row) => inactiveChild(row.entry, runs) !== null);
  const active = props.rows.filter((row) => inactiveChild(row.entry, runs) === null);
  const inactiveRuns = inactive.flatMap((row) => {
    const run = inactiveChild(row.entry, runs);
    return run === null ? [] : [run];
  });
  const open = props.expandedInactives.has(props.parentId);
  const rowOf = (row: ChatRowItem, compact: boolean): ReactNode => (
    <ChatRow
      key={row.entry.id}
      entry={row.entry}
      nested={row.nested}
      inactive={compact}
      selected={props.selected === row.entry.id}
      timeZone={props.timeZone}
      onOpen={props.onOpen}
      onDeleted={props.onDeleted}
    />
  );
  return (
    <CollapseRoot>
      {active.map((row) => rowOf(row, false))}
      {inactive.length === 0 ? null : (
        <>
          <InactiveHeader
            count={inactive.length}
            open={open}
            onToggle={() => {
              props.onToggleInactive(props.parentId);
            }}
            runs={inactiveRuns}
            parentId={props.parentId}
            onDeleted={props.onDeleted}
          />
          {open ? <CollapseBody>{inactive.map((row) => rowOf(row, true))}</CollapseBody> : null}
        </>
      )}
    </CollapseRoot>
  );
}
