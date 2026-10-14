import type { ReactNode } from 'react';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { API_ENDPOINTS as E, type ComputerAiStatus } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { Banner } from '../../../components/banner';
import { ActionRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { useIsOwner } from '../../../store/selectors';
import { ComputerFrame } from '../components/computer-frame';
import { ControlSettings } from '../components/control-settings';
import { NativeSetup } from '../components/native-setup';
import { ProviderSettings } from '../components/provider-settings';
import { PairComputerSheet } from '../components/pair-computer-sheet';
import { QueryState } from '../components/query-state';
import { SubscriptionRows } from '../components/subscription-rows';
import { useComputerAi } from '../data/computer-ai';

function OwnerBody({ status }: { readonly status: ComputerAiStatus }): ReactNode {
  const [pair, setPair] = useState(false);
  const revoke = useMutation({
    mutationFn: () => api().call(E.revokeComputerNode, { params: { deviceId: status.device_id } }),
    onError: (error) =>
      notify({ message: 'Computer connection wasn’t revoked', error, tone: 'critical' }),
  });
  return (
    <>
      <ControlSettings status={status} />
      <NativeSetup status={status} />
      <ProviderSettings status={status} />
      <SubscriptionRows deviceId={status.device_id} provider="claude" />
      <List title="Connection">
        <ActionRow
          title="Pair another computer"
          onPress={() => {
            setPair(true);
          }}
        />
        {status.local ? null : (
          <ActionRow
            title="Revoke computer connection"
            destructive
            disabled={revoke.isPending}
            onPress={() => {
              revoke.mutate();
            }}
          />
        )}
      </List>
      <PairComputerSheet
        open={pair}
        onClose={() => {
          setPair(false);
        }}
      />
    </>
  );
}

export function ComputerClaudeScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const status = useComputerAi(deviceId);
  const owner = useIsOwner();
  return (
    <ComputerFrame deviceId={deviceId} title="Claude">
      <QueryState
        error={status.error}
        pending={status.isPending}
        retry={() => {
          void status.refetch();
        }}
      />
      {status.data === undefined ? null : (
        <>
          <Banner
            tone={status.data.online ? 'positive' : 'warning'}
            title={status.data.online ? 'Computer connected' : 'Computer offline'}
            body="Native sessions and chat models are configured independently."
            wrapBody
          />
          {owner ? (
            <OwnerBody status={status.data} />
          ) : (
            <Text tone="variant">The hub owner can configure Claude on this computer.</Text>
          )}
        </>
      )}
    </ComputerFrame>
  );
}
