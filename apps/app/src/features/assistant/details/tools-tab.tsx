import type { ReactNode } from 'react';
import { View } from 'react-native';
import { MCP_TOOLS, type AiChatRow } from '@smarteverything/domain';
import { ReasonLine } from '../../../components/reason-line';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useIsOwner } from '../../../store/selectors';
import { changeChat } from '../chats/chat-actions';
import { isComputerEngine } from '../provider/computer-engine';
import {
  TOOL_GROUPS,
  allowedOf,
  stateOf,
  stored,
  withTool,
  withTools,
  type ToolGroup,
} from './tools-model';
import { background } from '@smarteverything/logging';

const READ_ONLY = 'Only the owner can change tools on this computer chat.';

interface Edit {
  readonly allowed: readonly string[];
  readonly disabled: boolean;
  readonly save: (next: readonly string[]) => void;
}

function GroupList({ group, edit }: { readonly group: ToolGroup; readonly edit: Edit }): ReactNode {
  const { allowed, disabled, save } = edit;
  const state = stateOf(allowed, group.tools);
  return (
    <List title={group.title}>
      {[
        <SwitchRow
          key="all"
          title="Allow all"
          value={state.all}
          mixed={state.mixed}
          disabled={disabled}
          onChange={(on) => {
            save(withTools(allowed, group.tools, on));
          }}
        />,
        ...group.tools.map((tool) => (
          <SwitchRow
            key={tool.name}
            title={tool.title}
            subtitle={tool.description}
            value={allowed.includes(tool.name)}
            disabled={disabled}
            onChange={(on) => {
              save(withTool(allowed, tool.name, on));
            }}
          />
        )),
      ]}
    </List>
  );
}

export function ToolsTab({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const owner = useIsOwner();
  const disabled = isComputerEngine(chat.engine) && !owner;
  const allowed = allowedOf(chat);
  const edit: Edit = {
    allowed,
    disabled,
    save: (next) => {
      background(changeChat(chat.id, { tools: stored(next) }), 'chat.change_failed');
    },
  };
  const everything = stateOf(allowed, MCP_TOOLS);
  return (
    <View className="gap-section-gap pb-3">
      {disabled ? (
        <View className="px-4">
          <ReasonLine icon="lock" text={READ_ONLY} />
        </View>
      ) : null}
      <List footer="Saved immediately.">
        <SwitchRow
          title={`Allow all · ${String(everything.on)} of ${String(everything.total)}`}
          value={everything.all}
          mixed={everything.mixed}
          disabled={disabled}
          onChange={(on) => {
            edit.save(withTools(allowed, MCP_TOOLS, on));
          }}
        />
      </List>
      {TOOL_GROUPS.map((group) => (
        <GroupList key={group.area} group={group} edit={edit} />
      ))}
    </View>
  );
}
