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
    return <List footer={query.error?.message ?? 'Loading native home-tool access…'}>{null}</List>;
  return (
    <List footer="Independent of provider execution and attached CLI access. The hub enforces its global tool policy. Repair the native link after enabling a previously revoked remote grant.">
      <SwitchRow
        title="Allow native home tools"
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
      title="CLI sessions and native access"
      footer={
        'Owned CLI chats use the native provider below. Legacy reads and attached CLI tools use native access. Home-tool grants have an independent switch.'
      }
    >
      <SwitchRow
        title="Legacy history and attached CLI access"
        value={status.settings.control.enabled}
        disabled={change.isPending}
        onChange={(enabled) => {
          change.mutate({ control: { enabled } });
        }}
      />
      <NavRow
        title="Sessions"
        subtitle="Owned shared CLI chats and read-only legacy history"
        href={href.settings.device(status.device_id, 'claude-sessions')}
      />
      <SwitchRow
        title="Keep native link installed"
        value={status.settings.control.auto_link}
        disabled={change.isPending}
        onChange={(auto_link) => {
          change.mutate({ control: { auto_link } });
        }}
      />
      <NavRow
        title="Home tool access"
        subtitle="Independent native MCP enablement and allowed areas"
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
