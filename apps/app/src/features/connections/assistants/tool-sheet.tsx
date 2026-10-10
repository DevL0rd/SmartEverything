import type { ReactNode } from 'react';
import { View } from 'react-native';
import { MCP_ASKING_TOOLS, type McpToolName, type McpToolSummary } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { toolTitle } from '../model/tool-text';

export interface ToolSheetProps {
  readonly tool: McpToolSummary<McpToolName> | null;
  readonly on: boolean;
  readonly onChange: (on: boolean) => void;
  readonly onClose: () => void;
}

export function ToolSheet({ tool, on, onChange, onClose }: ToolSheetProps): ReactNode {
  if (tool === null) {
    return null;
  }
  const confirmed = MCP_ASKING_TOOLS.has(tool.name);
  return (
    <Sheet open onClose={onClose} title={toolTitle(tool)} detents={['fit']}>
      <View className="gap-4">
        <View className="flex-row flex-wrap gap-2">
          <Badge
            label={tool.access === 'control' ? 'Can change things' : 'Only reads'}
            tone={tool.access === 'control' ? 'warning' : 'neutral'}
            icon={tool.access === 'control' ? 'pencil' : 'eye'}
          />
          {confirmed ? <Badge label="Asks before it runs" tone="neutral" icon="shield" /> : null}
        </View>
        <Text variant="body">{tool.description}</Text>
        <List inset>
          <SwitchRow title="Assistants can use it" value={on} onChange={onChange} />
        </List>
      </View>
    </Sheet>
  );
}
