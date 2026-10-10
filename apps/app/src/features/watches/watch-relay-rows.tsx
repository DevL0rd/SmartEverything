import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { WatchRelayStatus } from '../../../modules/health-connect';
import { Banner } from '../../components/banner';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { Text } from '../../components/text';
import { TextField } from '../../components/text-field';
import { href } from '../../app-shell/hrefs';
import { plural } from '../../format/text';
import { allowCalls, changeRelay, openAccess, usePhoneApps, useRelay } from './watch-relay';

const CONTENT_LABELS = {
  full: 'Title and message',
  title: 'Title only',
  app: 'App name only',
} as const;

const NEXT_CONTENT = { full: 'title', title: 'app', app: 'full' } as const;

function Unavailable({ reason }: { readonly reason: string | null }): ReactNode {
  return reason === null ? (
    <Text variant="callout" tone="variant">
      Only the Android app can talk to your watch.
    </Text>
  ) : (
    <Banner tone="critical" title="Watch settings on this phone can’t be read" body={reason} />
  );
}

function AccessRow({ status }: { readonly status: WatchRelayStatus }): ReactNode {
  return status.listenerAllowed ? (
    <ListRow title="Notification access" value="Allowed" icon="bell" />
  ) : (
    <ListRow
      title="Allow notification access"
      subtitle="Needed for notifications, music controls and opening notifications from the watch"
      icon="bell"
      chevron
      onPress={() => void openAccess('notifications')}
    />
  );
}

function NotificationRows({ status }: { readonly status: WatchRelayStatus }): ReactNode {
  const next = NEXT_CONTENT[status.content];
  return (
    <List title="Notifications">
      <AccessRow status={status} />
      <ListRow
        title="Send notifications to the watch"
        role="switch"
        checked={status.enabled}
        disabled={!status.listenerAllowed}
        onPress={() => void changeRelay({ enabled: !status.enabled })}
      />
      <ListRow
        title="Apps"
        value={status.apps.length === 0 ? 'None chosen' : plural(status.apps.length, 'app', 'apps')}
        chevron
        href={href.settings.page('health/watch/apps')}
      />
      <ListRow
        title="Show on the watch"
        value={CONTENT_LABELS[status.content]}
        onPress={() => void changeRelay({ content: next })}
      />
      <ListRow
        title="Only while the phone is locked"
        role="switch"
        checked={status.onlyWhenLocked}
        onPress={() => void changeRelay({ onlyWhenLocked: !status.onlyWhenLocked })}
      />
    </List>
  );
}

function PhoneRows({ status }: { readonly status: WatchRelayStatus }): ReactNode {
  const missing = status.callPermissionsMissing.length;
  return (
    <List title="Calls, music and finding">
      <ListRow
        title="Incoming calls"
        subtitle={
          status.calls && missing > 0
            ? `${plural(missing, 'permission', 'permissions')} still needed`
            : 'Reject or mute from the watch'
        }
        role="switch"
        checked={status.calls}
        onPress={() => void allowCalls(!status.calls)}
      />
      {status.calls && !status.dndAllowed ? (
        <ListRow
          title="Allow muting the ringer"
          subtitle="Android asks for Do Not Disturb access for this"
          chevron
          onPress={() => void openAccess('dnd')}
        />
      ) : null}
      <ListRow
        title="Music controls"
        subtitle="Play, pause, skip and volume from the watch"
        role="switch"
        checked={status.music}
        disabled={!status.listenerAllowed}
        onPress={() => void changeRelay({ music: !status.music })}
      />
      <ListRow
        title="Find my phone"
        subtitle="The watch can ring this phone, even on silent"
        role="switch"
        checked={status.findPhone}
        onPress={() => void changeRelay({ findPhone: !status.findPhone })}
      />
    </List>
  );
}

export function WatchRelayRows(): ReactNode {
  const relay = useRelay();
  if (relay.kind === 'loading') {
    return null;
  }
  if (relay.kind !== 'ready') {
    return <Unavailable reason={relay.kind === 'failed' ? relay.reason : null} />;
  }
  return (
    <View className="gap-section-gap">
      <NotificationRows status={relay.status} />
      <PhoneRows status={relay.status} />
    </View>
  );
}

function AppList({ status }: { readonly status: WatchRelayStatus }): ReactNode {
  const apps = usePhoneApps();
  const [filter, setFilter] = useState('');
  const chosen = new Set(status.apps);
  const shown = (apps ?? []).filter((app) =>
    app.label.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const toggle = (packageName: string): void => {
    const next = chosen.has(packageName)
      ? status.apps.filter((name) => name !== packageName)
      : [...status.apps, packageName];
    void changeRelay({ apps: next });
  };
  return (
    <View className="gap-4">
      <TextField label="Search apps" value={filter} onChange={setFilter} />
      <List>
        {shown.map((app) => (
          <ListRow
            key={app.packageName}
            title={app.label}
            role="checkbox"
            checked={chosen.has(app.packageName)}
            onPress={() => {
              toggle(app.packageName);
            }}
          />
        ))}
      </List>
    </View>
  );
}

export function WatchAppRows(): ReactNode {
  const relay = useRelay();
  if (relay.kind === 'loading') {
    return null;
  }
  return relay.kind === 'ready' ? (
    <AppList status={relay.status} />
  ) : (
    <Unavailable reason={relay.kind === 'failed' ? relay.reason : null} />
  );
}
