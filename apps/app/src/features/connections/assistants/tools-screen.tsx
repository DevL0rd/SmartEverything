import type { ReactNode } from 'react';
import { useState } from 'react';
import type { McpToolName, McpToolSummary } from '@smarteverything/domain';
import { updateMcpTools } from '../../../api/access';
import { ListRow } from '../../../components/list-row';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { useSettings } from '../../../store/selectors';
import { useEntityStore } from '../../../store/store-context';
import { TOOL_GROUPS, groupState, withGroup, withTool, type ToolGroup } from '../model/tools';
import { SettingsFrame } from '../../../settings/settings-frame';
import { ToolSheet } from './tool-sheet';

import { trackConnection } from '../connections-log';
type Tool = McpToolSummary<McpToolName>;

function useDisabledTools(): {
  readonly disabled: readonly string[];
  readonly change: (next: readonly string[]) => void;
} {
  const store = useEntityStore();
  const stored = useSettings().mcp_disabled_tools;
  const [pending, setPending] = useState<readonly string[] | null>(null);
  const change = (next: readonly string[]): void => {
    setPending(next);
    trackConnection('mcp_tools.update', { disabled: next.length }, () =>
      updateMcpTools(store, next),
    )
      .catch((error: unknown) => {
        notify({ message: 'Tools weren’t changed', error, tone: 'critical' });
      })
      .finally(() => {
        setPending(null);
      });
  };
  return { disabled: pending ?? stored, change };
}

interface GroupProps {
  readonly group: ToolGroup;
  readonly disabled: readonly string[];
  readonly change: (next: readonly string[]) => void;
  readonly open: (tool: Tool) => void;
}

function ToolRow({
  tool,
  disabled,
  open,
}: Omit<GroupProps, 'group' | 'change'> & {
  readonly tool: Tool;
}): ReactNode {
  return (
    <ListRow
      title={tool.title}
      subtitle={tool.line}
      value={disabled.includes(tool.name) ? 'Off' : 'On'}
      chevron
      onPress={() => {
        open(tool);
      }}
    />
  );
}

function Group({ group, disabled, change, open }: GroupProps): ReactNode {
  const state = groupState(group, disabled);
  const rows = group.tools.map((tool) => (
    <ToolRow key={tool.name} tool={tool} disabled={disabled} open={open} />
  ));
  return (
    <List inset title={group.title}>
      {group.tools.length > 1
        ? [
            <SwitchRow
              key="all"
              icon="circleCheck"
              title="Allow all"
              value={state !== 'off'}
              mixed={state === 'mixed'}
              onChange={(on) => {
                change(withGroup(disabled, group, on));
              }}
            />,
            ...rows,
          ]
        : rows}
    </List>
  );
}

export function ToolsScreen(): ReactNode {
  const { disabled, change } = useDisabledTools();
  const [shown, setShown] = useState<Tool | null>(null);
  return (
    <SettingsFrame page="assistant/integrations/tools">
      <Text variant="callout" tone="variant" className="px-4">
        Assistants can use these tools. New tools are on by default.
      </Text>
      {TOOL_GROUPS.map((group) => (
        <Group key={group.area} group={group} disabled={disabled} change={change} open={setShown} />
      ))}
      <ToolSheet
        tool={shown}
        on={shown !== null && !disabled.includes(shown.name)}
        onChange={(on) => {
          if (shown !== null) {
            change(withTool(disabled, shown.name, on));
          }
        }}
        onClose={() => {
          setShown(null);
        }}
      />
    </SettingsFrame>
  );
}
