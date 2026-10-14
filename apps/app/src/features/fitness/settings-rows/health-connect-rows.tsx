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
        ready ? (
          <Button
            label={connected ? 'Review access' : 'Connect'}
            loading={controls.busy === 'connect'}
            disabled={controls.busy !== null}
            onPress={controls.connect}
          />
        ) : undefined
      }
    />
  );
}

function featureAccess(availability: 'available' | 'unavailable', granted: boolean): string {
  if (availability === 'unavailable') {
    return 'not supported';
  }
  return granted ? 'allowed' : 'not allowed';
}

function PermissionsRow({ controls }: { readonly controls: HealthConnectControls }): ReactNode {
  const status = controls.status.data;
  const grants = controls.grants.data;
  if (status?.sdk !== 'available' || grants === undefined) {
    return null;
  }
  const summary = grantSummary(status.readableTypes, grants.types);
  const total = summary.granted.length + summary.missing.length;
  const reads = `Read ${String(summary.granted.length)} of ${String(total)}`;
  const writes =
    grants.writeTypes === undefined
      ? 'Update the app to review write access'
      : `Write ${String(grants.writeTypes.length)} of ${String(total)}`;
  const background = featureAccess(status.features.backgroundRead, grants.background);
  const history = featureAccess(status.features.historyRead, grants.history);
  return (
    <ListRow
      icon="shield"
      title="Data access"
      subtitle={`${reads} · ${writes}`}
      caption={`Background ${background} · History ${history}`}
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
          disabled={controls.busy !== null}
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
