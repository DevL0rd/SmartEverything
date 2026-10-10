import type { ReactNode } from 'react';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useThisPhoneSource } from '../data/this-phone';
import { useHealthConnect, type HealthConnectControls } from '../data/use-health-connect';
import { grantSummary } from '../model/sources';

function statusText(controls: HealthConnectControls, connected: boolean): string {
  const status = controls.status.data;
  if (status === undefined) {
    return controls.status.error === null ? 'Checking…' : 'Couldn’t check Health Connect';
  }
  if (status.sdk === 'unavailable') {
    return 'Not available on this phone';
  }
  if (status.sdk === 'provider_update_required') {
    return 'Update Health Connect from the Play Store';
  }
  return connected ? 'Connected' : 'Not connected';
}

function StatusRow({
  controls,
  connected,
}: {
  readonly controls: HealthConnectControls;
  readonly connected: boolean;
}): ReactNode {
  const ready = controls.status.data?.sdk === 'available';
  return (
    <ListRow
      icon="fitness"
      title="Health Connect"
      subtitle={statusText(controls, connected)}
      trailing={
        ready && !connected ? (
          <Button
            label="Connect"
            loading={controls.busy === 'connect'}
            onPress={controls.connect}
          />
        ) : undefined
      }
    />
  );
}

function PermissionsRow({ controls }: { readonly controls: HealthConnectControls }): ReactNode {
  const status = controls.status.data;
  const grants = controls.grants.data;
  if (status?.sdk !== 'available' || grants === undefined) {
    return null;
  }
  const summary = grantSummary(status.readableTypes, grants.types);
  const total = summary.granted.length + summary.missing.length;
  const allowed = `${String(summary.granted.length)} of ${String(total)} allowed`;
  return summary.missing.length === 0 ? (
    <ListRow icon="shield" title="Permissions" value="All allowed" />
  ) : (
    <ListRow
      icon="shield"
      title="Permissions"
      subtitle={allowed}
      value="Review"
      chevron
      onPress={() => {
        controls.askAgain(summary.missing);
      }}
    />
  );
}

function SyncRow({
  controls,
  lastSync,
  error,
}: {
  readonly controls: HealthConnectControls;
  readonly lastSync: string | null;
  readonly error: string | null;
}): ReactNode {
  const now = useMinute();
  const synced = lastSync === null ? 'Not synced yet' : `Synced ${relative(lastSync, now)}`;
  return (
    <ListRow
      icon="refresh"
      title="Sync"
      subtitle={error ?? synced}
      subtitleTone={error === null ? 'variant' : 'critical'}
      trailing={
        <Button
          label="Sync now"
          variant="tonal"
          loading={controls.busy === 'sync' || controls.syncing}
          onPress={controls.syncNow}
        />
      }
    />
  );
}

export function HealthConnectRows(): ReactNode {
  const controls = useHealthConnect();
  const source = useThisPhoneSource();
  const connected = source !== null;
  return (
    <>
      <StatusRow controls={controls} connected={connected} />
      {connected ? <PermissionsRow controls={controls} /> : null}
      {connected ? (
        <SyncRow controls={controls} lastSync={source.last_sync_at} error={source.last_error} />
      ) : null}
    </>
  );
}
