import { useState, type ReactNode } from 'react';
import { type ComputerRuntimeStatus } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { EmptyState } from '../../../components/empty-state';
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
  useCodexModels,
  useRuntimeSupported,
} from '../data/computer-runtime';
import { background } from '@smarteverything/logging';

function CodexModels({ status }: { readonly status: ComputerRuntimeStatus }): ReactNode {
  const models = useCodexModels(status.device_id);
  if (models.data === undefined || models.error !== null)
    return (
      <QueryState
        error={models.error}
        pending={models.isPending}
        retry={() => {
          background(models.refetch(), 'models.refetch_failed');
        }}
      />
    );
  if (models.data.length === 0)
    return (
      <EmptyState
        icon="bot"
        title="No Codex models"
        body={
          status.online
            ? (status.capabilities.provider_reason ?? 'This computer reported no Codex models.')
            : 'Reconnect this computer to discover its Codex models.'
        }
      />
    );
  return (
    <List>
      {models.data.map((model) => (
        <ValueRow
          key={model.id}
          title={model.name}
          subtitle={[model.reason ?? model.description, ...model.input_modalities, ...model.efforts]
            .filter(Boolean)
            .join(' · ')}
          wrapSubtitle
          value={model.available ? 'Available' : 'Unavailable'}
        />
      ))}
    </List>
  );
}
function RuntimeBody({ status }: { readonly status: ComputerRuntimeStatus }): ReactNode {
  const [models, showModels] = useState(false);
  if (status.settings.runtime !== 'codex') return null;
  return (
    <>
      <ProviderRows
        status={status}
        showModels={() => {
          showModels(true);
        }}
      />
      <SubscriptionRows deviceId={status.device_id} provider="chatgpt-codex" />
      <Sheet
        title="Codex models"
        open={models}
        onClose={() => {
          showModels(false);
        }}
        detents={['full']}
      >
        {models ? <CodexModels status={status} /> : null}
      </Sheet>
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
        <Text tone="variant">Only the owner may configure Codex on this computer.</Text>
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
  showModels,
}: {
  readonly status: ComputerRuntimeStatus;
  readonly showModels: () => void;
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
      <NavRow title="Available models" onPress={showModels} />
    </List>
  );
}
