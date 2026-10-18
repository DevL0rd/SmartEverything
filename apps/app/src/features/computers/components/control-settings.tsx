import type { ReactNode } from 'react';
import { useState } from 'react';
import { MCP_TOOL_AREAS, type ComputerAiStatus } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { NavRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { useNativeMcpPolicy, useNativeMcpPolicyChange } from '../data/native-mcp-policy';
import { useComputerAiChange } from '../data/computer-ai';

function HomeTools({ status }: { readonly status: ComputerAiStatus }): ReactNode {
  const query = useNativeMcpPolicy(status.device_id);
  const change = useNativeMcpPolicyChange(status.device_id);
  const policy = query.data;
  if (policy === undefined)
    return <List footer={query.error?.message ?? 'Loading home tools access…'}>{null}</List>;
  return (
    <List footer="Lets Claude on this computer use your home tools. After turning it on, repair the link.">
      <SwitchRow
        title="Let Claude use home tools"
        value={policy.enabled}
        disabled={change.isPending}
        onChange={(enabled) => {
          change.mutate({ ...policy, enabled });
        }}
      />
      <SwitchRow
        title="Follow allowed home tools"
        value={policy.areas === null}
        disabled={change.isPending}
        onChange={(enabled) => {
          change.mutate({ ...policy, areas: enabled ? null : [] });
        }}
      />
      {MCP_TOOL_AREAS.map((area) => (
        <SwitchRow
          key={area}
          title={area.replaceAll('_', ' ')}
          value={policy.areas?.includes(area) === true}
          disabled={change.isPending}
          onChange={(enabled) => {
            const current = policy.areas ?? [];
            change.mutate({
              ...policy,
              areas: enabled ? [...current, area] : current.filter((item) => item !== area),
            });
          }}
        />
      ))}
    </List>
  );
}

function ControlRows({
  status,
  showTools,
}: {
  readonly status: ComputerAiStatus;
  readonly showTools: () => void;
}): ReactNode {
  const change = useComputerAiChange(status.device_id);
  return (
    <List
      title="Claude sessions and history"
      footer={
        'Claude chats from SmartEverything use the settings below. Earlier history and attached tools need Earlier Claude history on.'
      }
    >
      <SwitchRow
        title="Earlier Claude history"
        value={status.settings.control.enabled}
        disabled={change.isPending}
        onChange={(enabled) => {
          change.mutate({ control: { enabled } });
        }}
      />
      <NavRow
        title="Sessions"
        subtitle="Claude chats and earlier history"
        href={href.settings.device(status.device_id, 'claude-sessions')}
      />
      <SwitchRow
        title="Keep home tools link"
        value={status.settings.control.auto_link}
        disabled={change.isPending}
        onChange={(auto_link) => {
          change.mutate({ control: { auto_link } });
        }}
      />
      <NavRow
        title="Home tool access"
        subtitle="Which home areas Claude may use"
        onPress={() => {
          showTools();
        }}
      />
    </List>
  );
}

export function ControlSettings({ status }: { readonly status: ComputerAiStatus }): ReactNode {
  const [tools, setTools] = useState(false);
  return (
    <>
      <ControlRows
        status={status}
        showTools={() => {
          setTools(true);
        }}
      />
      <Sheet
        open={tools}
        title="Home tool access"
        onClose={() => {
          setTools(false);
        }}
      >
        <HomeTools status={status} />
      </Sheet>
    </>
  );
}
