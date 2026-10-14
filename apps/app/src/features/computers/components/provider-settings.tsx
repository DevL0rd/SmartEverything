import type { ReactNode } from 'react';
import { useState } from 'react';
import type { ComputerAiStatus } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { NavRow, SwitchRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useComputerAiChange, useComputerModels } from '../data/computer-ai';
import { QueryState } from './query-state';

function Models({ status }: { readonly status: ComputerAiStatus }): ReactNode {
  const enabled = status.online && status.settings.provider.enabled;
  const models = useComputerModels(status.device_id, enabled);
  return (
    <>
      <QueryState
        error={models.error}
        pending={models.isPending ? enabled : false}
        retry={() => {
          void models.refetch();
        }}
      />
      <List>
        {(models.data ?? []).map((model) => (
          <ValueRow
            key={model.id}
            title={model.name}
            subtitle={model.reason ?? model.description}
            value={model.available ? 'Available' : 'Unavailable'}
          />
        ))}
      </List>
      {enabled ? null : (
        <Text tone="variant">
          {status.online
            ? 'Enable the provider to discover its models.'
            : 'This computer is offline. Its configured models stay bound to this computer.'}
        </Text>
      )}
    </>
  );
}

export function ProviderSettings({ status }: { readonly status: ComputerAiStatus }): ReactNode {
  const change = useComputerAiChange(status.device_id);
  const [shown, setShown] = useState(false);
  return (
    <>
      <List
        title="Models in SmartEverything"
        footer={
          status.capabilities.provider_reason ??
          'Uses the official Claude sign-in on this computer. Choose a supplying computer in your existing chat.'
        }
      >
        <SwitchRow
          title="Supply Claude models"
          value={status.settings.provider.enabled}
          disabled={change.isPending}
          onChange={(enabled) => {
            change.mutate({ provider: { enabled } });
          }}
        />
        <NavRow
          title="Provider options"
          subtitle="Folder, tools, permissions and settings sources"
          href={href.settings.device(status.device_id, 'claude-provider')}
        />
        <NavRow
          title="Available models"
          onPress={() => {
            setShown(true);
          }}
        />
        <ValueRow
          title="Runtime version"
          value={status.capabilities.runtime_version ?? 'Unavailable'}
        />
      </List>
      <Sheet
        title="Available models"
        open={shown}
        onClose={() => {
          setShown(false);
        }}
      >
        {shown ? <Models status={status} /> : null}
      </Sheet>
    </>
  );
}
