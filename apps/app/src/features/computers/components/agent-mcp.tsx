import type { ReactNode } from 'react';
import { CLAUDE_PROVIDER_OPTIONS } from '@smarteverything/domain';
import { View } from 'react-native';
import { TextField } from '../../../components/text-field';
import { Text } from '../../../components/text';
import { McpServers } from './mcp-servers';
import type { AgentFieldsProps } from './agent-fields';

export function AgentMcp({ value, change }: AgentFieldsProps): ReactNode {
  const checked = CLAUDE_PROVIDER_OPTIONS.shape.agents.safeParse({
    draft: { description: 'Draft', prompt: 'Draft', mcpServers: value['mcpServers'] ?? [] },
  });
  const entries = checked.success ? (checked.data?.['draft']?.mcpServers ?? []) : [];
  const references = entries.filter((entry) => typeof entry === 'string');
  const servers = Object.fromEntries(
    entries.flatMap((entry) => (typeof entry === 'string' ? [] : Object.entries(entry))),
  );
  return (
    <View className="gap-4">
      <Text variant="body-strong">Agent MCP servers</Text>
      <TextField
        label="Existing MCP server names"
        helper="One configured server name per line"
        value={references.join('\n')}
        multiline
        onChange={(text) => {
          change({ ...value, mcpServers: [...text.split('\n').filter(Boolean), servers] });
        }}
      />
      <McpServers
        servers={servers}
        change={(next) => {
          change({ ...value, mcpServers: [...references, next] });
        }}
      />
    </View>
  );
}
