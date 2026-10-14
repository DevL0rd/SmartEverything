import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { z } from 'zod';
import type { CLAUDE_MCP_SERVER } from '@smarteverything/domain';
import { ActionRow, SelectRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { TextField } from '../../../components/text-field';

type Remote = Extract<z.infer<typeof CLAUDE_MCP_SERVER>, { type: 'http' | 'sse' }>;
export type McpToolPolicies = NonNullable<Remote['tools']>;
function permissionOf(tool: McpToolPolicies[number], value: string): McpToolPolicies[number] {
  const { permission_policy: removed, ...rest } = tool;
  void removed;
  return value === ''
    ? rest
    : {
        ...rest,
        permission_policy: z.enum(['always_allow', 'always_ask', 'always_deny']).parse(value),
      };
}
function maximumOf(tool: McpToolPolicies[number], value: string): McpToolPolicies[number] {
  const { org_max_permission: removed, ...rest } = tool;
  void removed;
  return value === ''
    ? rest
    : { ...rest, org_max_permission: z.enum(['allow', 'ask', 'blocked']).parse(value) };
}
function PolicySelects({
  tool,
  change,
}: {
  readonly tool: McpToolPolicies[number];
  readonly change: (tool: McpToolPolicies[number]) => void;
}): ReactNode {
  return (
    <>
      <SelectRow
        title="Permission policy"
        value={tool.permission_policy ?? ''}
        options={['', 'always_allow', 'always_ask', 'always_deny'].map((value) => ({
          value,
          label: value === '' ? 'Server default' : value,
        }))}
        onChange={(value) => {
          change(permissionOf(tool, value));
        }}
      />
      <SelectRow
        title="Organization maximum"
        value={tool.org_max_permission ?? ''}
        options={['', 'allow', 'ask', 'blocked'].map((value) => ({
          value,
          label: value === '' ? 'Server default' : value,
        }))}
        onChange={(value) => {
          change(maximumOf(tool, value));
        }}
      />
    </>
  );
}
function ToolPolicy({
  tool,
  change,
}: {
  readonly tool: McpToolPolicies[number];
  readonly change: (tool: McpToolPolicies[number]) => void;
}): ReactNode {
  return (
    <View className="gap-3">
      <TextField
        label="Tool name"
        value={tool.name}
        onChange={(name) => {
          change({ ...tool, name });
        }}
      />
      <PolicySelects tool={tool} change={change} />
    </View>
  );
}
export function McpToolPolicyFields({
  tools,
  change,
}: {
  readonly tools: McpToolPolicies;
  readonly change: (tools: McpToolPolicies) => void;
}): ReactNode {
  const [next, setNext] = useState('');
  return (
    <List title="Remote tool policies">
      {tools.map((tool, index) => (
        <View key={String(index)} className="gap-2 px-4 py-3">
          <ToolPolicy
            tool={tool}
            change={(value) => {
              change(tools.map((entry, position) => (position === index ? value : entry)));
            }}
          />
          <ActionRow
            title="Remove tool policy"
            destructive
            onPress={() => {
              change(tools.filter((_, position) => position !== index));
            }}
          />
        </View>
      ))}
      <View className="px-4 py-3">
        <TextField label="New tool name" value={next} onChange={setNext} />
      </View>
      <ActionRow
        title="Add tool policy"
        disabled={next.trim() === ''}
        onPress={() => {
          change([...tools, { name: next.trim() }]);
          setNext('');
        }}
      />
    </List>
  );
}
