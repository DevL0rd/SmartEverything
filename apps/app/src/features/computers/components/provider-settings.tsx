import type { ReactNode } from 'react';
import { useState } from 'react';
import type { ComputerAiStatus } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { NavRow, SwitchRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useComputerAiChange, useComputerModels } from '../data/computer-ai';
import { ProviderReasonNotice } from './provider-reason-notice';
import { QueryState } from './query-state';
import { background } from '@smarteverything/logging';

const READY_FOOTER =
  'Uses your Claude sign-in on this computer. Pick this computer in any chat with Switch machine.';

function Models({ status }: { readonly status: ComputerAiStatus }): ReactNode {
  const enabled = status.online && status.settings.provider.enabled;
  const models = useComputerModels(status.device_id, enabled);
  return (
    <>
      <QueryState
        error={models.error}
        pending={models.isPending ? enabled : false}
        retry={() => {
          background(models.refetch(), 'models.refetch_failed');
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
            ? 'Turn this on to see its models.'
            : 'This computer is offline. Its configured models stay bound to this computer.'}
        </Text>
      )}
    </>
  );
}

export function ProviderSettings({ status }: { readonly status: ComputerAiStatus }): ReactNode {
  const change = useComputerAiChange(status.device_id);
  const [shown, setShown] = useState(false);
  const reason = status.capabilities.provider_reason;
  return (
    <>
      {reason === null ? null : (
        <ProviderReasonNotice deviceId={status.device_id} reason={reason} />
      )}
      <List
        title="Models in SmartEverything"
        {...(reason === null ? { footer: READY_FOOTER } : {})}
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
