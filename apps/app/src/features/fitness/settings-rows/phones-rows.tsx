import { Logger, background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import type { HealthSourceRow } from '@smarteverything/domain';
import { revokeHealthSource } from '../../../api/health';
import { confirm } from '../../../components/confirm-store';
import { ListRow } from '../../../components/list-row';
import { OverflowButton, type MenuItem } from '../../../components/menu';
import { notify } from '../../../components/toast-store';
import { relative } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { useRow } from '../../../store/selectors';
import { useSources } from '../data/sources';

const log = new Logger('app.fitness');
function remove(name: string, source: HealthSourceRow): void {
  background(
    confirm({
      title: `Stop syncing from ${name}?`,
      body: 'Data already synced stays. Connect again on the phone to resume.',
      confirmLabel: 'Stop syncing',
      tone: 'destructive',
    }).then((accepted) => {
      if (!accepted) {
        return;
      }
      log.info('health_source.revoke_requested', { clientId: source.client_id });
      revokeHealthSource(source.client_id).then(
        () => {
          log.info('health_source.revoked', { clientId: source.client_id });
        },
        (error: unknown) => {
          log.error('health_source.revoke_failed', error, { clientId: source.client_id });
          notify({ message: `${name} still syncs`, error, tone: 'critical' });
        },
      );
    }),
    'phones_rows.confirm_failed',
  );
}

function syncText(source: HealthSourceRow, now: number): string {
  return source.last_sync_at === null
    ? 'Not synced yet'
    : `Synced ${relative(source.last_sync_at, now)}`;
}

function PhoneRow({ source }: { readonly source: HealthSourceRow }): ReactNode {
  const synced = useMinuteOf((now) => syncText(source, now));
  const client = useRow('clients', source.client_id);
  const name = client?.name ?? source.name;
  const menu: readonly MenuItem[] = [
    {
      label: 'Stop syncing',
      icon: 'trash',
      destructive: true,
      onPress: (): void => {
        remove(name, source);
      },
    },
  ];
  return (
    <ListRow
      icon="smartphone"
      title={name}
      subtitle={source.last_error ?? synced}
      subtitleTone={source.last_error === null ? 'variant' : 'critical'}
      trailing={<OverflowButton items={menu} label={`${name} options`} />}
    />
  );
}

export function PhonesRows(): ReactNode {
  const sources = useSources();
  if (sources.length === 0) {
    return <ListRow icon="smartphone" title="No phones sync health data yet" />;
  }
  return sources.map((source) => <PhoneRow key={source.client_id} source={source} />);
}
