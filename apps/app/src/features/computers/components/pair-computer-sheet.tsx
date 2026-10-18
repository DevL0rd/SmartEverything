import type { ReactNode } from 'react';
import type { z } from 'zod';
import { useState } from 'react';
import { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { API_ENDPOINTS as E, type COMPUTER_NODE_PAIRING } from '@smarteverything/domain';
import { api, useConnection } from '../../../api/transport';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { rawErrorText } from '../../../format/errors';
import { timeText } from '../../../format/locale';

function PairInstructions({
  pairing,
}: {
  readonly pairing: z.infer<typeof COMPUTER_NODE_PAIRING> | undefined;
}): ReactNode {
  return (
    <View className="gap-3">
      {pairing === undefined ? null : (
        <>
          <Text variant="title-2" selectable>
            {pairing.code}
          </Text>
          <Text tone="variant">Expires {timeText(new Date(pairing.expires_at))}</Text>
          <Text selectable>
            smarteverything-service --pair-node --hub {pairing.url} --code {pairing.code}
            {pairing.pin === null ? '' : ` --pin ${pairing.pin}`}
          </Text>
          <Text>
            Run this once on that computer. It joins your home together with its SmartEverything
            window, and pairing it again replaces the old pairing. Sign in to Claude Code there; its
            models appear after you turn on “Supply Claude models”.
          </Text>
        </>
      )}
    </View>
  );
}

function PairComputerBody(): ReactNode {
  const connection = useConnection();
  const [url, setUrl] = useState(connection.status === 'paired' ? connection.connection.url : '');
  const pairing = useMutation({
    mutationFn: () => api().call(E.pairComputerNode, { body: { url } }),
  });
  return (
    <View className="gap-4">
      <Text>
        Install SmartEverything on the computer you want to connect. The code connects that computer
        to your home.
      </Text>
      <TextField
        label="Hub URL reachable from this computer"
        kind="url"
        value={url}
        onChange={setUrl}
      />
      <Button
        label="Generate service pairing code"
        loading={pairing.isPending}
        disabled={url.trim() === ''}
        onPress={() => {
          pairing.mutate();
        }}
      />
      {pairing.error === null ? null : <Text tone="critical">{rawErrorText(pairing.error)}</Text>}
      <PairInstructions pairing={pairing.data} />
    </View>
  );
}

export function PairComputerSheet({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet open={open} onClose={onClose} title="Pair a computer" detents={['full']}>
      {open ? <PairComputerBody /> : null}
    </Sheet>
  );
}
