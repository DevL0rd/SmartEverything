import { usePluginScreen } from '../shared/plugin-log';
import type { NetworkClient, RouterSnapshot } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { ReasonLine } from '../../components/reason-line';
import { SelectRow, ValueRow } from '../../components/rows';
import { List } from '../../components/section';
import { Sheet } from '../../components/sheet';
import { TextField } from '../../components/text-field';
import { useProfiles } from '../../store/people';
import { useIsOwner } from '../../store/selectors';
import { PluginActionRow, PluginButton } from '../shared/plugin-action';
import { renameProblem } from './client-model';
import { ClientDns } from './clients/client-dns';
import { ClientDetails, ClientLead, ClientLive } from './clients/client-details';
import { blockInternet } from './router-confirmations';
import { useRouterTools } from './router-data';
import { background } from '@smarteverything/logging';

const NOBODY = 'nobody';

function Owner({
  client,
  disabled,
}: {
  readonly client: NetworkClient;
  readonly disabled: boolean;
}): ReactNode {
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
      disabled={disabled}
      onChange={(value) => {
        background(
          tools.run(
            'assign_client',
            { mac: client.mac, profileId: value === NOBODY ? null : value },
            'The owner wasn’t changed',
          ),
          'tools.run_failed',
        );
      }}
    />
  );
}

function Rename({
  client,
  disabled,
}: {
  readonly client: NetworkClient;
  readonly disabled: boolean;
}): ReactNode {
  const tools = useRouterTools();
  const [name, setName] = useState(client.name);
  const trimmed = name.trim();
  const problem = renameProblem(name);
  return (
    <View className="gap-2">
      <TextField
        label="Name on the router"
        value={name}
        onChange={setName}
        helper="1 to 32 characters, without < or >"
        error={problem}
        disabled={disabled}
      />
      <View className="items-start">
        <PluginButton
          label="Save name"
          disabled={disabled || problem !== null || trimmed === client.name}
          onPress={() =>
            tools.run(
              'update_client',
              { client: { action: 'rename', mac: client.mac, name: trimmed } },
              'The name wasn’t saved',
            )
          }
        />
      </View>
    </View>
  );
}

function InternetRow({
  client,
  disabled,
}: {
  readonly client: NetworkClient;
  readonly disabled: boolean;
}): ReactNode {
  const tools = useRouterTools();
  const { mac } = client;
  if (client.blocked) {
    return (
      <PluginActionRow
        title="Allow internet"
        icon="circleCheck"
        disabled={disabled}
        onPress={() =>
          tools.run(
            'update_client',
            { client: { action: 'unblock', mac } },
            'The device wasn’t allowed',
          )
        }
      />
    );
  }
  return (
    <PluginActionRow
      title="Block internet"
      icon="ban"
      destructive
      disabled={disabled}
      confirmation={blockInternet(client.name)}
      onPress={() =>
        tools.run(
          'cut_off_client',
          { client: { action: 'block', mac } },
          'The device wasn’t blocked',
        )
      }
    />
  );
}

function Actions({
  client,
  disabled,
}: {
  readonly client: NetworkClient;
  readonly disabled: boolean;
}): ReactNode {
  const tools = useRouterTools();
  const { ip, mac } = client;
  return (
    <List title="Actions">
      {ip === null ? null : (
        <PluginActionRow
          title="Always give it this address"
          subtitle={ip}
          icon="mapPin"
          disabled={disabled}
          onPress={() =>
            tools.run(
              'update_client',
              { client: { action: 'reserve', mac, ip } },
              'The address wasn’t reserved',
            )
          }
        />
      )}
      {client.connected && client.connection === 'wifi' ? (
        <PluginActionRow
          title="Disconnect from Wi-Fi"
          icon="wifi"
          disabled={disabled}
          onPress={() =>
            tools.run(
              'cut_off_client',
              { client: { action: 'disconnect', mac } },
              'The device wasn’t disconnected',
            )
          }
        />
      ) : null}
      <InternetRow client={client} disabled={disabled} />
    </List>
  );
}

function Controls({
  client,
  live,
}: {
  readonly client: NetworkClient;
  readonly live: boolean;
}): ReactNode {
  const profiles = useProfiles();
  if (!useIsOwner()) {
    const owner = profiles.find((profile) => profile.id === client.profileId)?.name ?? 'Nobody';
    return (
      <>
        <ReasonLine icon="lock" text="Only the home’s owner can change devices on the router." />
        <List>
          <ValueRow title="Belongs to" icon="user" value={owner} />
        </List>
      </>
    );
  }
  return (
    <>
      {live ? null : (
        <ReasonLine icon="info" text="The router can’t be reached, so changes are paused." />
      )}
      <List>
        <Owner client={client} disabled={!live} />
      </List>
      <Rename key={client.mac} client={client} disabled={!live} />
      <Actions client={client} disabled={!live} />
    </>
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
  usePluginScreen('router', 'ClientSheet');
  return (
    <Sheet open={client !== null} onClose={onClose} title={client?.name ?? 'Device'} scroll>
      {client === null ? null : (
        <View className="gap-section-gap">
          <ClientLead client={client} />
          {snapshot.connection.state === 'online' ? (
            <ClientLive client={client} snapshot={snapshot} />
          ) : null}
          <ClientDetails client={client} />
          <Controls client={client} live={snapshot.connection.state === 'online'} />
          <ClientDns client={client} />
        </View>
      )}
    </Sheet>
  );
}
