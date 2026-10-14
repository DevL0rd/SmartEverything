import type { ReactNode } from 'react';
import { useIsOwner } from '../../../store/selectors';
import { ComputerFrame } from '../components/computer-frame';
import { ProviderOptions } from '../components/provider-options';
import { QueryState } from '../components/query-state';
import {
  useComputerAi,
  useComputerAiChange,
  useComputerProviderMetadata,
} from '../data/computer-ai';

export function ComputerProviderScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const status = useComputerAi(deviceId);
  const change = useComputerAiChange(deviceId);
  const owner = useIsOwner();
  const metadata = useComputerProviderMetadata(
    deviceId,
    owner && status.data?.online === true && status.data.settings.provider.enabled,
  );
  return (
    <ComputerFrame deviceId={deviceId} title="Claude provider options">
      <QueryState
        error={status.error}
        pending={status.isPending}
        retry={() => {
          void status.refetch();
        }}
      />
      <QueryState
        error={metadata.error}
        pending={false}
        retry={() => {
          void metadata.refetch();
        }}
      />
      {status.data === undefined || !owner ? null : (
        <ProviderOptions
          options={status.data.settings.provider.options}
          {...(metadata.data === undefined ? {} : { metadata: metadata.data })}
          pending={change.isPending}
          save={(options) => {
            change.mutate({ provider: { options } });
          }}
        />
      )}
    </ComputerFrame>
  );
}
