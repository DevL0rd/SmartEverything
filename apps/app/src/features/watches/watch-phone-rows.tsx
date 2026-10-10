import type { ReactNode } from 'react';
import { useState } from 'react';
import type { WatchPhase } from '@smarteverything/domain';
import type { PhoneWatchStatus } from '../../../modules/health-connect';
import { href } from '../../app-shell/hrefs';
import { Banner } from '../../components/banner';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { relative } from '../../format/time';
import { useMinute } from '../../store/clock';
import {
  allowHealthConnectWrites,
  keepInBackground,
  openVendorSettings,
  reconnect,
  ringWatch,
  setPaused,
  syncNow,
} from './watch-link';

export const PHASE_TEXT: Readonly<Record<WatchPhase, string>> = {
  paused: 'Paused for Mi Fitness',
  waiting: 'Waiting for the watch',
  connecting: 'Connecting',
  authenticating: 'Signing in',
  connected: 'Connected',
  failed: 'Not connected',
};

function liveText(watch: PhoneWatchStatus): string | null {
  if (watch.worn === false) {
    return watch.steps === null ? 'Off the wrist' : `${String(watch.steps)} steps · off the wrist`;
  }
  const parts = [
    watch.steps === null ? null : `${String(watch.steps)} steps`,
    watch.heartRate === null || watch.heartRate === 0 ? null : `${String(watch.heartRate)} bpm`,
  ].filter((part) => part !== null);
  return parts.length === 0 ? null : parts.join(' · ');
}

function syncText(watch: PhoneWatchStatus, now: number): string {
  if (watch.syncing) {
    return watch.syncDetail ?? 'Syncing…';
  }
  return watch.lastSyncAt === null ? 'Not synced yet' : `Synced ${relative(watch.lastSyncAt, now)}`;
}

export function VendorBanner({ watch }: { readonly watch: PhoneWatchStatus }): ReactNode {
  const vendor = watch.vendorApps.find((app) => app.state === 'allowed');
  if (vendor === undefined) {
    return null;
  }
  return (
    <Banner
      tone="warning"
      title={`${vendor.label} can take over your watch`}
      body={`Turn off ${vendor.label}’s Nearby devices permission so this phone keeps the watch. For watch faces or updates in ${vendor.label}: turn on Pause, allow Nearby devices again, finish, then turn it off and Pause off.`}
      action={{
        label: 'Open settings',
        onPress: () => void openVendorSettings(vendor.packageName),
      }}
    />
  );
}

function ConnectionRows({ watch }: { readonly watch: PhoneWatchStatus }): ReactNode {
  const now = useMinute();
  const live = liveText(watch);
  return (
    <>
      <ListRow
        title={PHASE_TEXT[watch.phase]}
        subtitle={
          watch.phase === 'connected' && watch.connectedAt !== null
            ? `Since ${relative(watch.connectedAt, now)}`
            : watch.detail
        }
        icon="bluetooth"
      />
      {live === null ? null : <ListRow title="Right now" value={live} icon="heartPulse" />}
      <ListRow
        title="Sync now"
        subtitle={syncText(watch, now)}
        icon="refresh"
        disabled={watch.syncing || watch.phase !== 'connected'}
        onPress={() => {
          void syncNow();
        }}
      />
      {watch.firmware === null ? null : (
        <ListRow title="Firmware" value={watch.firmware} icon="info" />
      )}
    </>
  );
}

function FindRow({ watch }: { readonly watch: PhoneWatchStatus }): ReactNode {
  const [ringing, setRinging] = useState(false);
  return (
    <ListRow
      title={ringing ? 'Stop ringing the watch' : 'Find watch'}
      subtitle={ringing ? 'Tap when you’ve found it' : 'Makes the watch ring and vibrate'}
      icon="watch"
      disabled={watch.phase !== 'connected'}
      onPress={() => {
        const on = !ringing;
        setRinging(on);
        void ringWatch(watch.deviceId, on);
      }}
    />
  );
}

function ControlRows({ watch }: { readonly watch: PhoneWatchStatus }): ReactNode {
  return (
    <>
      <FindRow watch={watch} />
      <ListRow
        title="Pause for Mi Fitness"
        subtitle="Disconnects so Mi Fitness can use the watch"
        role="switch"
        checked={watch.paused}
        onPress={() => {
          void setPaused(watch.deviceId, !watch.paused);
        }}
      />
      <ListRow
        title="Stay connected in the background"
        subtitle={watch.associated ? 'On' : 'Reconnects when the watch comes back in range'}
        icon="refresh"
        chevron={!watch.associated}
        disabled={watch.associated}
        onPress={() => {
          void keepInBackground(watch.deviceId);
        }}
      />
      <ListRow
        title="Save watch data to Health Connect"
        subtitle="Lets other apps see it too"
        icon="fitness"
        chevron
        onPress={() => {
          void allowHealthConnectWrites();
        }}
      />
      {watch.paused ? null : (
        <ListRow
          title="Reconnect now"
          icon="refresh"
          onPress={() => {
            void reconnect();
          }}
        />
      )}
    </>
  );
}

function SettingsLinks(): ReactNode {
  return (
    <List title="Settings">
      <ListRow
        title="Watch settings"
        subtitle="Heart rate, alarms, sleep mode and watch faces"
        icon="settings"
        chevron
        href={href.settings.page('health/watch-settings')}
      />
      <ListRow
        title="Notifications, calls and music"
        icon="bell"
        chevron
        href={href.settings.page('health/watch')}
      />
    </List>
  );
}

export function PhoneRows({ watch }: { readonly watch: PhoneWatchStatus }): ReactNode {
  return (
    <>
      <SettingsLinks />
      <List title="Connection">
        <ConnectionRows watch={watch} />
      </List>
      <List title="On this phone">
        <ControlRows watch={watch} />
      </List>
    </>
  );
}
