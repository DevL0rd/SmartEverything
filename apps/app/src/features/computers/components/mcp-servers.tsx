import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ClaudeMcpServers } from '@smarteverything/domain';
import { ActionRow, NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { McpServerForm } from './mcp-server-form';

function ServerRows({
  servers,
  change,
  edit,
}: {
  readonly servers: ClaudeMcpServers;
  readonly change: (servers: ClaudeMcpServers) => void;
  readonly edit: (name: string | null) => void;
}): ReactNode {
  return (
    <List
      title="Native MCP servers"
      footer="User servers run on the supplying computer. The protected home bridge and its permissions stay managed by the hub."
    >
      {Object.entries(servers).map(([name, server]) => (
        <View key={name}>
          <NavRow
            title={name}
            subtitle={
              server.type === 'stdio'
                ? `stdio · ${server.command}`
                : `${server.type} · ${server.url}`
            }
            onPress={() => {
              edit(name);
            }}
          />
          <ActionRow
            title={`Remove ${name}`}
            destructive
            onPress={() => {
              change(Object.fromEntries(Object.entries(servers).filter(([key]) => key !== name)));
            }}
          />
        </View>
      ))}
      <ActionRow
        title="Add native MCP server"
        onPress={() => {
          edit(null);
        }}
      />
    </List>
  );
}
export function McpServers({
  servers,
  change,
}: {
  readonly servers: ClaudeMcpServers;
  readonly change: (servers: ClaudeMcpServers) => void;
}): ReactNode {
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <View className="gap-3">
      <ServerRows
        servers={servers}
        change={change}
        edit={(name) => {
          setEditing(name);
          setOpen(true);
        }}
      />
      <Sheet
        open={open}
        title={editing === null ? 'Add native MCP server' : `Edit ${editing}`}
        onClose={() => {
          setOpen(false);
        }}
        detents={['full']}
      >
        {open ? (
          <McpServerForm
            key={editing ?? 'new'}
            name={editing}
            servers={servers}
            save={(values) => {
              change(values);
              setOpen(false);
            }}
          />
        ) : null}
      </Sheet>
    </View>
  );
}
