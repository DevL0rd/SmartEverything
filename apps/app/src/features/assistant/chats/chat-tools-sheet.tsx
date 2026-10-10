import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  MCP_TOOLS,
  MCP_TOOL_AREAS,
  MCP_TOOL_AREA_LABELS,
  type AiChatRow,
} from '@smarteverything/domain';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { changeChat } from './chat-actions';

const ALL_NAMES: readonly string[] = MCP_TOOLS.map((tool) => tool.name);

const GROUPS = MCP_TOOL_AREAS.map((area) => ({
  area,
  title: MCP_TOOL_AREA_LABELS[area],
  tools: MCP_TOOLS.filter((tool) => tool.area === area),
})).filter((group) => group.tools.length > 0);

type Group = (typeof GROUPS)[number];

function allowedOf(chat: AiChatRow): readonly string[] {
  return chat.tools ?? ALL_NAMES;
}

function save(chat: AiChatRow, allowed: readonly string[]): void {
  const everything = ALL_NAMES.every((name) => allowed.includes(name));
  void changeChat(chat.id, { tools: everything ? null : [...allowed] });
}

function withTool(allowed: readonly string[], name: string, on: boolean): readonly string[] {
  const rest = allowed.filter((item) => item !== name);
  return on ? [...rest, name] : rest;
}

function withGroup(allowed: readonly string[], group: Group, on: boolean): readonly string[] {
  const names: readonly string[] = group.tools.map((tool) => tool.name);
  const rest = allowed.filter((name) => !names.includes(name));
  return on ? [...rest, ...names] : rest;
}

function GroupList({
  chat,
  group,
}: {
  readonly chat: AiChatRow;
  readonly group: Group;
}): ReactNode {
  const allowed = allowedOf(chat);
  const on = group.tools.filter((tool) => allowed.includes(tool.name)).length;
  const rows = group.tools.map((tool) => (
    <SwitchRow
      key={tool.name}
      title={tool.title}
      subtitle={tool.description}
      value={allowed.includes(tool.name)}
      onChange={(value) => {
        save(chat, withTool(allowed, tool.name, value));
      }}
    />
  ));
  return (
    <List title={group.title}>
      {[
        <SwitchRow
          key="all"
          title="Allow all"
          value={on > 0}
          mixed={on > 0 && on < group.tools.length}
          onChange={(value) => {
            save(chat, withGroup(allowed, group, value));
          }}
        />,
        ...rows,
      ]}
    </List>
  );
}

export function ChatToolsSheet({
  chat,
  open,
  onClose,
}: {
  readonly chat: AiChatRow;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet open={open} onClose={onClose} title="Tools for this chat" detents={['full']}>
      {open ? (
        <View className="gap-section-gap">
          <Text variant="callout" tone="variant" className="px-4">
            Choose which tools the assistant may use in this chat.
          </Text>
          {GROUPS.map((group) => (
            <GroupList key={group.area} chat={chat} group={group} />
          ))}
        </View>
      ) : null}
    </Sheet>
  );
}
