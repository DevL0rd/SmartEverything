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

function PairInstructions({
  pairing,
  url,
}: {
  readonly pairing: z.infer<typeof COMPUTER_NODE_PAIRING> | undefined;
  readonly url: string;
}): ReactNode {
  return (
    <View className="gap-3">
      {pairing === undefined ? null : (
        <>
          <Text variant="title-2" selectable>
            {pairing.code}
          </Text>
          <Text tone="variant">Expires {new Date(pairing.expires_at).toLocaleTimeString()}</Text>
          <Text selectable>
            smarteverything-service --pair-node --hub {pairing.url} --code {pairing.code}
          </Text>
          <Text>
            Then start the packaged computer service normally. Sign into the official Claude Code
            runtime locally on that computer. Its models appear after you enable “Supply Claude
            models”.
          </Text>
        </>
      )}
      <Text tone="variant">
        For the desktop app window, generate a separate ordinary app pairing code from Pair a
        device, then run:
      </Text>
      <Text selectable>
        smarteverything-service --pair-node-window --hub {url} --code APP_PAIRING_CODE
      </Text>
      <Text tone="variant">
        The service credential and desktop window credential are separate. Use the ordinary app
        pairing code for the window.
      </Text>
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
        Install the packaged SmartEverything computer service on the computer you want to connect.
        This code grants that service its own connection.
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
      <PairInstructions pairing={pairing.data} url={url} />
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
