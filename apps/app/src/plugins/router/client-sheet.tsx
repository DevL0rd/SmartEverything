import type { NetworkClient, RouterSnapshot } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { ActionRow, SelectRow, ValueRow } from '../../components/rows';
import { List } from '../../components/section';
import { Sheet } from '../../components/sheet';
import { TextField } from '../../components/text-field';
import { moment } from '../../format/time';
import { useMinute } from '../../store/clock';
import { useProfiles } from '../../store/people';
import { connectionText, signalOf } from './client-model';
import { useRouterTools } from './router-data';

const NOBODY = 'nobody';

function Owner({ client }: { readonly client: NetworkClient }): ReactNode {
  const profiles = useProfiles();
  const tools = useRouterTools();
  const options = [
    { value: NOBODY, label: 'Nobody' },
    ...profiles.map((profile) => ({ value: profile.id, label: profile.name })),
  ];
  return (
    <SelectRow
      title="Belongs to"
      subtitle="Used to tell who is home"
      icon="user"
      options={options}
      value={client.profileId ?? NOBODY}
      onChange={(value) =>
        void tools.run('assign_client', {
          mac: client.mac,
          profileId: value === NOBODY ? null : value,
        })
      }
    />
  );
}

function Rename({ client }: { readonly client: NetworkClient }): ReactNode {
  const tools = useRouterTools();
  const [name, setName] = useState(client.name);
  const trimmed = name.trim();
  const valid = trimmed.length > 0 && trimmed.length <= 32 && !/[<>]/.test(trimmed);
  return (
    <View className="gap-2">
      <TextField
        label="Name on the router"
        value={name}
        onChange={setName}
        error={valid ? null : 'Use 1 to 32 characters, without < or >'}
      />
      <Button
        label="Save name"
        variant="tonal"
        disabled={!valid || trimmed === client.name}
        onPress={() =>
          void tools.run('update_client', {
            client: { action: 'rename', mac: client.mac, name: trimmed },
          })
        }
      />
    </View>
  );
}

function Actions({ client }: { readonly client: NetworkClient }): ReactNode {
  const tools = useRouterTools();
  const act = (action: 'disconnect' | 'block' | 'unblock'): void => {
    void tools.run(action === 'unblock' ? 'update_client' : 'cut_off_client', {
      client: { action, mac: client.mac },
    });
  };
  const { ip } = client;
  return (
    <List title="Actions">
      {ip === null ? null : (
        <ActionRow
          title="Always give it this address"
          subtitle={ip}
          icon="mapPin"
          onPress={() =>
            void tools.run('update_client', { client: { action: 'reserve', mac: client.mac, ip } })
          }
        />
      )}
      {client.connected && client.connection === 'wifi' ? (
        <ActionRow
          title="Disconnect from Wi-Fi"
          icon="wifi"
          onPress={() => {
            act('disconnect');
          }}
        />
      ) : null}
      {client.blocked ? (
        <ActionRow
          title="Allow internet"
          icon="globe"
          onPress={() => {
            act('unblock');
          }}
        />
      ) : (
        <ActionRow
          title="Block internet"
          icon="ban"
          destructive
          onPress={() => {
            act('block');
          }}
        />
      )}
    </List>
  );
}

function Details({
  client,
  snapshot,
}: {
  readonly client: NetworkClient;
  readonly snapshot: RouterSnapshot;
}): ReactNode {
  const now = useMinute();
  const signal = signalOf(snapshot, client.mac);
  return (
    <List>
      <ValueRow title="Connection" value={connectionText(client)} />
      {client.ip === null ? null : <ValueRow title="Address" value={client.ip} />}
      <ValueRow title="Hardware address" value={client.mac} />
      {signal === null ? null : <ValueRow title="Signal" value={`${String(signal)} dBm`} />}
      {client.lastSeen === null || client.connected ? null : (
        <ValueRow title="Last seen" value={moment(client.lastSeen, now)} />
      )}
    </List>
  );
}

export function ClientSheet({
  client,
  snapshot,
  onClose,
}: {
  readonly client: NetworkClient | null;
  readonly snapshot: RouterSnapshot;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet open={client !== null} onClose={onClose} title={client?.name ?? 'Device'} scroll>
      {client === null ? null : (
        <View className="gap-section-gap">
          <Details client={client} snapshot={snapshot} />
          <List>
            <Owner client={client} />
          </List>
          <Rename key={client.mac} client={client} />
          <Actions client={client} />
        </View>
      )}
    </Sheet>
  );
}
