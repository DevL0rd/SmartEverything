import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useIsOwner } from '../../../store/selectors';
import { CollapseBody, CollapseRoot, TurnChevron } from '../../../components/disclosure';
import type { ChatEntry } from './chat-entry';
import { ChatRow } from './chat-row';
import { deleteInactiveAgents } from './row-actions';
import { background } from '@smarteverything/logging';

export interface InactiveAgentsProps {
  readonly agents: readonly ChatEntry[];
  readonly selected: string | null;
  readonly timeZone: string | null;
  readonly onOpen: (chatId: string) => void;
  readonly onToggleAgents: (chatId: string) => void;
  readonly onDeleted: (chatId: string) => void;
}

function InactiveHeader({
  count,
  open,
  agents,
  onToggle,
}: {
  readonly count: number;
  readonly open: boolean;
  readonly agents: readonly ChatEntry[];
  readonly onToggle: () => void;
}): ReactNode {
  const owner = useIsOwner();
  return (
    <View className="flex-row items-center gap-1">
      <Interactive
        label={`${open ? 'Collapse' : 'Expand'} ${String(count)} inactive agents`}
        expanded={open}
        onPress={onToggle}
        className="min-h-touch-min min-w-0 flex-1 flex-row items-center gap-2 rounded-sm"
        layerClassName="rounded-sm"
      >
        <TurnChevron open={open} />
        <Text variant="footnote" tone="variant">{`Inactive agents · ${String(count)}`}</Text>
      </Interactive>
      {open && owner ? (
        <Interactive
          label={`Delete all ${String(count)} inactive agent chats`}
          onPress={() => {
            background(deleteInactiveAgents(agents), 'inactive_agents.delete_failed');
          }}
          className="min-h-touch-min justify-center rounded-sm px-3"
          layerClassName="rounded-sm"
        >
          <Text variant="label" tone="critical">
            Delete all
          </Text>
        </Interactive>
      ) : null}
    </View>
  );
}

export function InactiveAgents(props: InactiveAgentsProps): ReactNode {
  const [open, setOpen] = useState(false);
  if (props.agents.length === 0) {
    return null;
  }
  return (
    <CollapseRoot className="pt-2">
      <InactiveHeader
        count={props.agents.length}
        open={open}
        agents={props.agents}
        onToggle={() => {
          setOpen((current) => !current);
        }}
      />
      {open ? (
        <CollapseBody>
          {props.agents.map((entry) => (
            <ChatRow
              key={entry.id}
              entry={entry}
              agent
              agentCount={0}
              agentsRunning={0}
              agentsNeeding={0}
              agentsOpen={false}
              selected={props.selected === entry.id}
              timeZone={props.timeZone}
              onOpen={props.onOpen}
              onToggleAgents={props.onToggleAgents}
              onDeleted={props.onDeleted}
            />
          ))}
        </CollapseBody>
      ) : null}
    </CollapseRoot>
  );
}
