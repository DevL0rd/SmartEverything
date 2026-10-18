import { useState, type ReactNode } from 'react';
import { MCP_TOOL_AREAS, type ComputerRuntimeStatus } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { NavRow, SwitchRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useIsOwner } from '../../../store/selectors';
import { ComputerFrame } from '../components/computer-frame';
import { SubscriptionRows } from '../components/subscription-rows';
import { QueryState } from '../components/query-state';
import {
  useComputerRuntime,
  useComputerRuntimeChange,
  useCodexRead,
  useRuntimeSupported,
} from '../data/computer-runtime';
import { background } from '@smarteverything/logging';

function CodexHomeTools({ status }: { readonly status: ComputerRuntimeStatus }): ReactNode {
  const change = useComputerRuntimeChange(status.device_id);
  if (status.settings.runtime !== 'codex') return null;
  const control = status.settings.settings.control;
  return (
    <List footer="Separate from Claude. Uses the home tools you allowed in Settings.">
      <SwitchRow
        title="Follow allowed home tools"
        value={control.mcp_areas === null}
        disabled={change.isPending}
        onChange={(enabled) => {
          change.mutate({
            runtime: 'codex',
            settings: { control: { mcp_areas: enabled ? null : [] } },
          });
        }}
      />
      {MCP_TOOL_AREAS.map((area) => (
        <SwitchRow
          key={area}
          title={area.replaceAll('_', ' ')}
          value={control.mcp_areas?.includes(area) === true}
          disabled={change.isPending}
          onChange={(enabled) => {
            const current = control.mcp_areas ?? [];
            change.mutate({
              runtime: 'codex',
              settings: {
                control: {
                  mcp_areas: enabled ? [...current, area] : current.filter((item) => item !== area),
                },
              },
            });
          }}
        />
      ))}
    </List>
  );
}
function CodexModels({ status }: { readonly status: ComputerRuntimeStatus }): ReactNode {
  const models = useCodexRead(status.device_id, { operation: 'models' }, status.online);
  return (
    <>
      <QueryState
        error={models.error}
        pending={models.isPending ? status.online : false}
        retry={() => {
          background(models.refetch(), 'models.refetch_failed');
        }}
      />
      <List>
        {models.data?.operation !== 'models'
          ? null
          : models.data.value.map((model) => (
              <ValueRow
                key={model.id}
                title={model.name}
                subtitle={`${model.reason ?? model.description} · ${model.input_modalities.join(', ')} · ${model.efforts.join(', ')}`}
                value={model.available ? 'Available' : 'Unavailable'}
              />
            ))}
      </List>
    </>
  );
}
function RuntimeBody({ status }: { readonly status: ComputerRuntimeStatus }): ReactNode {
  const change = useComputerRuntimeChange(status.device_id);
  const [sheet, setSheet] = useState<'tools' | 'models' | null>(null);
  if (status.settings.runtime !== 'codex') return null;
  const settings = status.settings.settings;
  return (
    <>
      <List
        title="Codex sessions"
        footer={status.capabilities.control_reason ?? 'Connected to Codex on this computer.'}
      >
        <SwitchRow
          title="Control Codex sessions"
          value={settings.control.enabled}
          disabled={change.isPending}
          onChange={(enabled) => {
            change.mutate({ runtime: 'codex', settings: { control: { enabled } } });
          }}
        />
        <NavRow
          title="Sessions"
          subtitle="Messages, work, requests and usage"
          href={href.settings.device(status.device_id, 'codex-sessions')}
        />
        <NavRow
          title="Home tool access"
          subtitle={
            settings.control.mcp_areas === null
              ? 'Follow allowed home tools'
              : `${String(settings.control.mcp_areas.length)} areas allowed`
          }
          onPress={() => {
            setSheet('tools');
          }}
        />
      </List>
      <ProviderRows status={status} setSheet={setSheet} />
      <SubscriptionRows deviceId={status.device_id} provider="chatgpt-codex" />
      <RuntimeSheet sheet={sheet} setSheet={setSheet} status={status} />
    </>
  );
}
export function ComputerCodexScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const supported = useRuntimeSupported();
  const owner = useIsOwner();
  const status = useComputerRuntime(deviceId);
  return (
    <ComputerFrame deviceId={deviceId} title="Codex">
      {!supported ? (
        <Text tone="variant">Update the hub to configure Codex on this computer.</Text>
      ) : !owner ? (
        <Text tone="variant">Only the owner may configure or control Codex on this computer.</Text>
      ) : (
        <>
          <QueryState
            error={status.error}
            pending={status.isPending}
            retry={() => {
              background(status.refetch(), 'status.refetch_failed');
            }}
          />
          {status.data === undefined ? null : (
            <>
              <Banner
                tone={status.data.online ? 'positive' : 'warning'}
                title={status.data.online ? 'Computer connected' : 'Computer offline'}
                body="Sessions and models are set up separately."
                wrapBody
              />
              <RuntimeBody status={status.data} />
            </>
          )}
        </>
      )}
    </ComputerFrame>
  );
}

function ProviderRows({
  status,
  setSheet,
}: {
  readonly status: ComputerRuntimeStatus;
  readonly setSheet: (sheet: 'models') => void;
}): ReactNode {
  const change = useComputerRuntimeChange(status.device_id);
  if (status.settings.runtime !== 'codex') return null;
  const settings = status.settings.settings;
  return (
    <List
      title="Use Codex in SmartEverything"
      footer={
        status.capabilities.provider_reason ??
        'Coding runs on this computer in a separate SmartEverything session.'
      }
    >
      <SwitchRow
        title="Supply Codex models"
        value={settings.provider.enabled}
        disabled={change.isPending}
        onChange={(enabled) => {
          change.mutate({ runtime: 'codex', settings: { provider: { enabled } } });
        }}
      />
      <ValueRow title="Authentication" value={status.capabilities.authentication} />
      <ValueRow title="Plan" value={status.capabilities.subscription} />
      <ValueRow
        title="Runtime version"
        value={status.capabilities.runtime_version ?? 'Unavailable'}
      />
      <NavRow
        title="Provider options"
        subtitle="Working folder, approvals, sandbox and output schema"
        href={href.settings.device(status.device_id, 'codex-provider')}
      />
      <NavRow
        title="Available models"
        onPress={() => {
          setSheet('models');
        }}
      />
    </List>
  );
}

function RuntimeSheet({
  sheet,
  setSheet,
  status,
}: {
  readonly sheet: 'tools' | 'models' | null;
  readonly setSheet: (sheet: 'tools' | 'models' | null) => void;
  readonly status: ComputerRuntimeStatus;
}): ReactNode {
  return (
    <Sheet
      title={sheet === 'tools' ? 'Codex home tools' : 'Codex models'}
      open={sheet !== null}
      onClose={() => {
        setSheet(null);
      }}
      detents={['full']}
    >
      {sheet === 'tools' ? (
        <CodexHomeTools status={status} />
      ) : sheet === 'models' ? (
        <CodexModels status={status} />
      ) : null}
    </Sheet>
  );
}
