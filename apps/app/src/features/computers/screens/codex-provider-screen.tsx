import type { ReactNode } from 'react';
import { Text } from '../../../components/text';
import { useIsOwner } from '../../../store/selectors';
import { ComputerFrame } from '../components/computer-frame';
import { CodexOptions } from '../components/codex-options';
import { QueryState } from '../components/query-state';
import {
  useComputerRuntime,
  useComputerRuntimeChange,
  useRuntimeSupported,
} from '../data/computer-runtime';
export function ComputerCodexProviderScreen({
  deviceId,
}: {
  readonly deviceId: string;
}): ReactNode {
  const supported = useRuntimeSupported();
  const owner = useIsOwner();
  const status = useComputerRuntime(deviceId);
  const change = useComputerRuntimeChange(deviceId);
  return (
    <ComputerFrame deviceId={deviceId} title="Codex provider options">
      {!supported ? (
        <Text tone="variant">Update the hub to configure Codex provider options.</Text>
      ) : !owner ? (
        <Text tone="variant">Only the owner may configure Codex provider options.</Text>
      ) : (
        <>
          <QueryState
            error={status.error}
            pending={status.isPending}
            retry={() => {
              void status.refetch();
            }}
          />
          {status.data?.settings.runtime !== 'codex' ? null : (
            <CodexOptions
              key={JSON.stringify(status.data.settings.settings.provider.options)}
              options={status.data.settings.settings.provider.options}
              pending={change.isPending}
              save={(options) => {
                change.mutate({ runtime: 'codex', settings: { provider: { options } } });
              }}
            />
          )}
        </>
      )}
    </ComputerFrame>
  );
}
