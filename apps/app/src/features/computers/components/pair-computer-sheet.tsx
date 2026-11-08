import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  HTTPS_URL,
  type ComputerNodePairing,
  type HubConnectionMetadata,
  type HubEndpoint,
} from '@smarteverything/domain';
import { api, useConnection } from '../../../api/transport';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Select, type SelectOption } from '../../../components/select';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { rawErrorText } from '../../../format/errors';
import { desktopBridge } from '../../../design/platform';
import { useIsOwner } from '../../../store/selectors';
import { timeText } from '../../../format/locale';

const HUB_CONNECTION_KEY = ['hub', 'connection'] as const;

export interface PairingAddresses {
  readonly endpoints: readonly HubEndpoint[];
  readonly suggested: string | null;
}

function bare(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function pairingAddresses(
  metadata: HubConnectionMetadata,
  current: string | null,
): PairingAddresses {
  const endpoints = [
    ...metadata.endpoints.filter((endpoint) => endpoint.kind === 'lan'),
    ...metadata.endpoints.filter((endpoint) => endpoint.kind === 'remote'),
  ];
  const currentUrl = current === null ? null : bare(current);
  const reached = endpoints.find((endpoint) => bare(endpoint.url) === currentUrl);
  return { endpoints, suggested: (reached ?? endpoints[0])?.url ?? null };
}

function addressProblem(url: string): string | null {
  const value = bare(url);
  return value === '' || HTTPS_URL.safeParse(value).success ? null : 'Use an https:// address';
}

function PairInstructions({ pairing }: { readonly pairing: ComputerNodePairing }): ReactNode {
  const desktop = desktopBridge();
  const owner = useIsOwner();
  const local = useMutation({
    mutationFn: async () => {
      await desktop?.pairComputer?.(pairing);
    },
  });
  return (
    <View className="gap-3">
      <Text variant="title-2" selectable>
        {pairing.code}
      </Text>
      <Text tone="variant">Expires {timeText(new Date(pairing.expires_at))}</Text>
      {desktop?.pairComputer !== undefined && owner ? (
        <Button
          label="Pair this computer"
          loading={local.isPending}
          disabled={local.isSuccess}
          onPress={() => {
            local.mutate();
          }}
        />
      ) : null}
      {local.isSuccess ? <Text>This computer is paired.</Text> : null}
      {local.error === null ? null : <Text tone="critical">{rawErrorText(local.error)}</Text>}
      <Text selectable>
        smarteverything --pair-node --hub {pairing.url} --code {pairing.code}
        {pairing.pin === null ? '' : ` --pin ${pairing.pin}`}
      </Text>
      <Text>
        To pair another computer, run this with its SmartEverything desktop executable. Sign in to
        Claude Code there to supply its models.
      </Text>
    </View>
  );
}

function NoHttpsAddress(): ReactNode {
  return (
    <Banner
      tone="warning"
      title="Your hub has no https address"
      body="Computers reach the hub over https on your home network or through its public address. Connect the hub to your network or set a public address in Server settings."
      wrapBody
      action={{ label: 'Server settings', href: href.settings.page('server') }}
    />
  );
}

function AddressPicker({
  endpoints,
  url,
  onChange,
}: {
  readonly endpoints: readonly HubEndpoint[];
  readonly url: string;
  readonly onChange: (url: string) => void;
}): ReactNode {
  if (endpoints.length < 2) return null;
  const options: readonly SelectOption<string>[] = endpoints.map((endpoint) => ({
    value: endpoint.url,
    label: endpoint.url,
    description: endpoint.kind === 'lan' ? 'Home network' : 'Public address',
  }));
  const chosen = endpoints.find((endpoint) => endpoint.url === bare(url));
  return (
    <Select
      label="Hub addresses"
      options={options}
      value={chosen?.url ?? null}
      placeholder="Pick one of the hub’s addresses"
      onChange={onChange}
    />
  );
}

function AddressStatus({
  query,
}: {
  readonly query: UseQueryResult<HubConnectionMetadata>;
}): ReactNode {
  if (query.isPending) return <Text tone="variant">Reading the hub’s addresses…</Text>;
  if (query.error === null) return null;
  return (
    <View className="gap-3">
      <Text tone="critical">{rawErrorText(query.error)}</Text>
      <Button
        label="Try again"
        variant="tonal"
        onPress={() => {
          background(query.refetch(), 'pair_computer.addresses_refetch_failed');
        }}
      />
    </View>
  );
}

function useHubAddresses(): {
  readonly query: UseQueryResult<HubConnectionMetadata>;
  readonly addresses: PairingAddresses | null;
} {
  const connection = useConnection();
  const query = useQuery({
    queryKey: HUB_CONNECTION_KEY,
    queryFn: () => api().call(E.hubConnection, {}),
  });
  const current = connection.status === 'paired' ? connection.connection.url : null;
  return {
    query,
    addresses: query.data === undefined ? null : pairingAddresses(query.data, current),
  };
}

function useAddressInput(addresses: PairingAddresses | null): {
  readonly url: string;
  readonly problem: string | null;
  readonly ready: boolean;
  readonly type: (url: string) => void;
} {
  const [typed, setTyped] = useState<string | null>(null);
  const url = typed ?? addresses?.suggested ?? '';
  const problem = addressProblem(url);
  return { url, problem, ready: bare(url) !== '' && problem === null, type: setTyped };
}

function PairComputerBody(): ReactNode {
  const { query, addresses } = useHubAddresses();
  const input = useAddressInput(addresses);
  const pairing = useMutation({
    mutationFn: () => api().call(E.pairComputerNode, { body: { url: bare(input.url) } }),
  });
  return (
    <View className="gap-4">
      <Text>
        Install SmartEverything on the computer you want to connect. The code connects that computer
        to your home.
      </Text>
      <AddressStatus query={query} />
      {addresses?.endpoints.length === 0 ? <NoHttpsAddress /> : null}
      <AddressPicker endpoints={addresses?.endpoints ?? []} url={input.url} onChange={input.type} />
      <TextField
        label="Hub URL reachable from this computer"
        kind="url"
        placeholder="https://"
        value={input.url}
        error={input.problem}
        onChange={input.type}
      />
      <Button
        label="Generate service pairing code"
        loading={pairing.isPending}
        disabled={!input.ready}
        onPress={() => {
          pairing.mutate();
        }}
      />
      {pairing.error === null ? null : <Text tone="critical">{rawErrorText(pairing.error)}</Text>}
      {pairing.data === undefined ? null : (
        <PairInstructions key={pairing.data.code} pairing={pairing.data} />
      )}
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
