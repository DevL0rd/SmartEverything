import type { RouterSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { CopyButton } from '../../../components/copy-button';
import { ListRow } from '../../../components/list-row';
import { ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { count, decimal } from '../../../format/number';
import { duration } from '../../../format/time';
import { PluginActionRow } from '../../shared/plugin-action';
import { RESTART_ROUTER, RESTART_WIFI } from '../router-confirmations';
import { useRouterTools } from '../router-data';

function unavailableReason(connection: RouterSnapshot['connection']): string {
  if (connection.state === 'paused') {
    return 'Monitoring is paused';
  }
  return connection.state === 'connecting'
    ? 'Connecting to the router…'
    : 'Can’t reach the router right now';
}

function CopyRow({ title, value }: { readonly title: string; readonly value: string }): ReactNode {
  return (
    <ListRow
      title={title}
      value={value}
      trailing={<CopyButton value={value} label={`Copy ${title.toLowerCase()}`} what={title} />}
    />
  );
}

function present(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value !== '';
}

function Identity({ info }: { readonly info: RouterSnapshot['info'] }): ReactNode {
  return (
    <>
      {present(info?.model) ? <ValueRow title="Model" value={info.model} /> : null}
      {present(info?.firmware) ? <ValueRow title="Firmware" value={info.firmware} /> : null}
      {present(info?.lanIp) ? <CopyRow title="Address" value={info.lanIp} /> : null}
    </>
  );
}

function Wiring({
  network,
}: {
  readonly network: NonNullable<RouterSnapshot['network']>;
}): ReactNode {
  return (
    <>
      {network.dns.length === 0 ? null : (
        <ValueRow title="DNS servers" value={network.dns.join(' · ')} />
      )}
      {network.ports.length === 0 ? null : (
        <ListRow
          title="Wired ports"
          wrapSubtitle
          subtitle={network.ports.map((port) => `${port.port} ${port.link || '—'}`).join(' · ')}
        />
      )}
    </>
  );
}

function Connection({ network }: { readonly network: RouterSnapshot['network'] }): ReactNode {
  return (
    <>
      {present(network?.publicIp) ? (
        <CopyRow title="Public address" value={network.publicIp} />
      ) : null}
      {present(network?.gateway) ? <CopyRow title="Gateway" value={network.gateway} /> : null}
      {present(network?.protocol) ? (
        <ValueRow title="Connection type" value={network.protocol} />
      ) : null}
      {network === null ? null : <Wiring network={network} />}
    </>
  );
}

function Load({ snapshot }: { readonly snapshot: RouterSnapshot }): ReactNode {
  const { info, system } = snapshot;
  return (
    <>
      {system === null ? null : (
        <ValueRow
          title="Connections"
          value={`${count(system.connections)} of ${count(system.connectionsMax)}`}
        />
      )}
      {info === null ? null : <ValueRow title="Running for" value={duration(info.uptimeSeconds)} />}
    </>
  );
}

function Facts({ snapshot }: { readonly snapshot: RouterSnapshot }): ReactNode {
  return (
    <>
      <Identity info={snapshot.info} />
      <Connection network={snapshot.network} />
      <Load snapshot={snapshot} />
    </>
  );
}

function cadenceText(snapshot: RouterSnapshot): string | undefined {
  if (snapshot.connection.state !== 'online' || snapshot.intervalSeconds === null) {
    return undefined;
  }
  const seconds = decimal(snapshot.intervalSeconds);
  return snapshot.cadence === 'fast'
    ? `Updates every ${seconds} s while you’re looking.`
    : `Updates every ${seconds} s in the background.`;
}

export function RouterCard({ snapshot }: { readonly snapshot: RouterSnapshot }): ReactNode {
  const tools = useRouterTools();
  const reachable = snapshot.connection.state === 'online';
  const footer = cadenceText(snapshot);
  const reason = unavailableReason(snapshot.connection);
  return (
    <List title="Router" {...(footer === undefined ? {} : { footer })}>
      <Facts snapshot={snapshot} />
      <PluginActionRow
        title="Restart Wi-Fi"
        subtitle={reachable ? 'Everyone on Wi-Fi drops for about a minute' : reason}
        icon="refresh"
        disabled={!reachable}
        confirmation={RESTART_WIFI}
        onPress={() => tools.run('restart_wifi', {}, 'Wi-Fi didn’t restart')}
      />
      <PluginActionRow
        title="Restart router"
        subtitle={reachable ? 'The whole home is offline for a few minutes' : reason}
        icon="power"
        destructive
        disabled={!reachable}
        confirmation={RESTART_ROUTER}
        onPress={() => tools.run('reboot', {}, 'The router didn’t restart')}
      />
    </List>
  );
}
