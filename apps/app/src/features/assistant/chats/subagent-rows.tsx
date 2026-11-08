import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useIsOwner } from '../../../store/selectors';
import { CollapseBody, CollapseRoot, TurnChevron } from '../../../components/disclosure';
import { plural } from '../../../format/text';
import type { ChatEntry } from './chat-entry';
import { ChatRow, type ChatRowProps } from './chat-row';
import { deleteInactiveAgents } from './row-actions';

interface CompletedHelpersProps {
  readonly entries: readonly ChatEntry[];
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly selected: string | null;
  readonly timeZone: string | null;
  readonly onOpen: (chatId: string) => void;
  readonly onDeleted: (chatId: string) => void;
}

const COMPLETED_ROW: Pick<
  ChatRowProps,
  'agent' | 'agentCount' | 'agentsRunning' | 'agentsNeeding' | 'agentsOpen' | 'onToggleAgents'
> = {
  agent: true,
  agentCount: 0,
  agentsRunning: 0,
  agentsNeeding: 0,
  agentsOpen: false,
  onToggleAgents: () => undefined,
};

function CompletedRows(props: CompletedHelpersProps): ReactNode {
  return props.entries.map((entry) => (
    <ChatRow
      key={entry.id}
      entry={entry}
      {...COMPLETED_ROW}
      selected={props.selected === entry.id}
      timeZone={props.timeZone}
      onOpen={props.onOpen}
      onDeleted={props.onDeleted}
    />
  ));
}

export function CompletedHelpers(props: CompletedHelpersProps): ReactNode {
  const { open, onToggle } = props;
  const owner = useIsOwner();
  const count = props.entries.length;
  if (count === 0) return null;
  const group = plural(count, 'completed helper');
  return (
    <CollapseRoot className="px-gutter pt-2">
      <View className="flex-row items-center gap-1">
        <Interactive
          label={`${open ? 'Collapse' : 'Expand'} ${group}`}
          expanded={open}
          onPress={onToggle}
          className="min-h-touch-min min-w-0 flex-1 flex-row items-center gap-2 rounded-sm"
          layerClassName="rounded-sm"
        >
          <TurnChevron open={open} />
          <Text variant="footnote" tone="variant">{`Completed helpers · ${String(count)}`}</Text>
        </Interactive>
        {open && owner ? (
          <Interactive
            label={`Delete all ${group}`}
            onPress={() => {
              background(
                deleteInactiveAgents(props.entries, props.onDeleted),
                'inactive_agents.delete_failed',
              );
            }}
            className="min-h-touch-min justify-center rounded-sm px-2"
            layerClassName="rounded-sm"
          >
            <Text variant="label" tone="critical">
              Delete all
            </Text>
          </Interactive>
        ) : null}
      </View>
      {open ? (
        <CollapseBody>
          <CompletedRows {...props} />
        </CollapseBody>
      ) : null}
    </CollapseRoot>
  );
}
