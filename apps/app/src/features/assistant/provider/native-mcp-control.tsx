import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { AiChatRow, ClaudeMcpServers } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { McpServers } from '../../computers/components/mcp-servers';
import { useProviderControl } from './provider-data';
import { ProviderResult } from './provider-result';

export function NativeMcpControl({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const initial = chat.engine.kind === 'claude' ? (chat.engine.settings.mcp_servers ?? {}) : {};
  const [servers, change] = useState<ClaudeMcpServers>(initial);
  const control = useProviderControl(chat.id);
  return (
    <View className="gap-section-gap">
      <McpServers servers={servers} change={change} />
      <Button
        label="Apply native MCP servers to session"
        loading={control.isPending}
        onPress={() => {
          control.mutate({ action: 'set_mcp_servers', servers });
        }}
      />
      {control.data === undefined ? null : (
        <ProviderResult title="Server connections" value={control.data} />
      )}
    </View>
  );
}
