import type { ReactNode } from 'react';
import type { HealthSourceRow } from '@smarteverything/domain';
import { revokeHealthSource } from '../../../api/health';
import { confirm } from '../../../components/confirm-store';
import { ListRow } from '../../../components/list-row';
import { OverflowButton, type MenuItem } from '../../../components/menu';
import { notify } from '../../../components/toast-store';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useRow } from '../../../store/selectors';
import { useActiveSources } from '../data/sources';

function remove(name: string, source: HealthSourceRow): void {
  void confirm({
    title: `Stop syncing from ${name}?`,
    body: 'Data already synced stays. Connect again on the phone to resume.',
    confirmLabel: 'Stop syncing',
    tone: 'destructive',
  }).then((accepted) => {
    if (!accepted) {
      return;
    }
    revokeHealthSource(source.id).catch((error: unknown) => {
      notify({ message: `${name} still syncs`, error, tone: 'critical' });
    });
  });
}

function syncText(source: HealthSourceRow, now: number): string {
  return source.last_sync_at === null
    ? 'Not synced yet'
    : `Synced ${relative(source.last_sync_at, now)}`;
}

function PhoneRow({
  source,
  now,
}: {
  readonly source: HealthSourceRow;
  readonly now: number;
}): ReactNode {
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
      subtitle={source.last_error ?? syncText(source, now)}
      subtitleTone={source.last_error === null ? 'variant' : 'critical'}
      trailing={<OverflowButton items={menu} label={`${name} options`} />}
    />
  );
}

export function PhonesRows(): ReactNode {
  const now = useMinute();
  const sources = useActiveSources();
  if (sources.length === 0) {
    return <ListRow icon="smartphone" title="No phones sync health data yet" />;
  }
  return sources.map((source) => <PhoneRow key={source.id} source={source} now={now} />);
}
