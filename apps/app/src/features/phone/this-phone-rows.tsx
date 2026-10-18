import type { ReactNode } from 'react';
import { Platform, View } from 'react-native';
import type { PhoneNodeStatus } from '../../../modules/health-connect';
import { Banner } from '../../components/banner';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { Text } from '../../components/text';
import { href } from '../../app-shell/hrefs';
import { relative } from '../../format/time';
import { useMinute } from '../../store/clock';
import { useLocalPref } from '../../store/local-prefs';
import { useHasScale, usePairedServer } from '../profiles';
import { useMyPhone } from './this-phone-device';
import { useWatchLink } from '../watches';
import { CONTEXT_TEXT } from './phone-context-text';
import { setPhoneNodeOn, usePhoneNode } from './phone-node';
import {
  allowAccessibility,
  allowOverlay,
  allowSoundControl,
  allowWriteSettings,
  keepRunning,
} from './phone-permissions';
import { SensorRows } from './phone-sensor-rows';
import { HomeWifiRow } from './home-wifi-row';
import { background } from '@smarteverything/logging';

function NodeRow({ status }: { readonly status: PhoneNodeStatus }): ReactNode {
  const server = usePairedServer();
  return (
    <ListRow
      title="Share this phone with your home"
      subtitle={
        server === null
          ? 'Pair this phone with your home first'
          : 'Battery, sound, music and what you’re doing. Your location stays on this phone.'
      }
      icon="smartphone"
      role="switch"
      checked={status.enabled}
      disabled={server === null && !status.enabled}
      onPress={() => {
        background(setPhoneNodeOn(!status.enabled, server), 'phone_node_on.set_failed');
      }}
    />
  );
}

function NowRow({ status }: { readonly status: PhoneNodeStatus }): ReactNode {
  const now = useMinute();
  const { state, since, place } = status.context;
  const doing = place === null ? CONTEXT_TEXT[state] : `${CONTEXT_TEXT[state]} · ${place}`;
  return (
    <ListRow
      title="Right now"
      value={state === 'unknown' ? doing : `${doing} · ${relative(since, now)}`}
      icon="footprints"
    />
  );
}

const KEEP_RUNNING =
  'Commands, calls and alerts reach this phone either way. Allow SmartEverything to keep running only for what stays on in the background:';

const SAMSUNG_NOTE =
  ' On Samsung phones, also remove SmartEverything from Sleeping apps in Battery settings.';

function samsung(): boolean {
  return Platform.OS === 'android' && Platform.constants.Manufacturer.toLowerCase() === 'samsung';
}

function useBackgroundJobs(): string[] {
  const link = useWatchLink();
  const talk = useLocalPref('talkEnabled');
  const scale = useHasScale();
  const jobs: string[] = [];
  if (link.kind === 'ready' && link.watches.length > 0) {
    jobs.push('your watch connection');
  }
  if (talk) {
    jobs.push('always-on walkie-talkie');
  }
  if (scale) {
    jobs.push('your scale');
  }
  return jobs;
}

function BackgroundRows({ status }: { readonly status: PhoneNodeStatus }): ReactNode {
  const jobs = useBackgroundJobs();
  if (jobs.length === 0) {
    return null;
  }
  const footer = `${KEEP_RUNNING} ${jobs.join(', ')}.`;
  return (
    <List title="Background" footer={samsung() ? footer + SAMSUNG_NOTE : footer}>
      {status.permissions.batteryUnrestricted ? (
        <ListRow title="Keep running" value="Allowed" icon="battery" />
      ) : (
        <ListRow
          title="Keep running"
          subtitle="Battery-optimised · background jobs may stop"
          icon="battery"
          chevron
          onPress={() => {
            background(keepRunning(), 'running.keep_failed');
          }}
        />
      )}
    </List>
  );
}

interface ControlGrant {
  readonly title: string;
  readonly subtitle: string;
  readonly allowed: boolean;
  readonly icon: 'bellOff' | 'lock' | 'appWindow' | 'sun';
  readonly allow: () => Promise<void>;
  readonly failure: string;
}

function grants(status: PhoneNodeStatus): readonly ControlGrant[] {
  const { permissions } = status;
  return [
    {
      title: 'Ringer and Do Not Disturb',
      subtitle: 'Android asks for Do Not Disturb access for this',
      allowed: permissions.dndAccess,
      icon: 'bellOff',
      allow: allowSoundControl,
      failure: 'sound_control.allow_failed',
    },
    {
      title: 'Brightness and screen timeout',
      subtitle: 'Android asks for Modify system settings for this',
      allowed: permissions.writeSettings,
      icon: 'sun',
      allow: allowWriteSettings,
      failure: 'write_settings.allow_failed',
    },
    {
      title: 'Lock and screenshots',
      subtitle: 'Turn on the SmartEverything accessibility service. It does not read your screen.',
      allowed: permissions.accessibility,
      icon: 'lock',
      allow: allowAccessibility,
      failure: 'accessibility.allow_failed',
    },
    {
      title: 'Open apps and links, show the unlock prompt',
      subtitle: 'Android asks for Display over other apps for this',
      allowed: permissions.overlay,
      icon: 'appWindow',
      allow: allowOverlay,
      failure: 'overlay.allow_failed',
    },
  ];
}

function ControlRows({ status }: { readonly status: PhoneNodeStatus }): ReactNode {
  return (
    <List title="Control from home">
      {grants(status).map((grant) =>
        grant.allowed ? (
          <ListRow key={grant.title} title={grant.title} value="Allowed" icon={grant.icon} />
        ) : (
          <ListRow
            key={grant.title}
            title={grant.title}
            subtitle={grant.subtitle}
            icon={grant.icon}
            chevron
            onPress={() => {
              background(grant.allow(), grant.failure);
            }}
          />
        ),
      )}
    </List>
  );
}

function PageLinkRow(): ReactNode {
  const phone = useMyPhone();
  if (phone === null) {
    return null;
  }
  return (
    <ListRow
      title="Open the phone page"
      subtitle="Battery, sound, screen, network, apps and notifications"
      icon="smartphone"
      chevron
      href={href.settings.device(phone.id, 'overview')}
    />
  );
}

function ReadyRows({
  status,
  pageLink,
}: {
  readonly status: PhoneNodeStatus;
  readonly pageLink: boolean;
}): ReactNode {
  return (
    <View className="gap-section-gap">
      <List>
        <NodeRow status={status} />
        {status.enabled ? <NowRow status={status} /> : null}
        {status.enabled && pageLink ? <PageLinkRow /> : null}
      </List>
      {status.enabled ? (
        <>
          <BackgroundRows status={status} />
          <SensorRows status={status} />
          <List title="Home">
            <HomeWifiRow status={status} />
          </List>
          <ControlRows status={status} />
        </>
      ) : null}
    </View>
  );
}

export function ThisPhoneRows({ pageLink = true }: { readonly pageLink?: boolean }): ReactNode {
  const node = usePhoneNode();
  switch (node.kind) {
    case 'loading':
      return null;
    case 'ready':
      return <ReadyRows status={node.status} pageLink={pageLink} />;
    case 'unsupported':
      return (
        <Text variant="callout" tone="variant">
          Only the Android app can share this phone with your home.
        </Text>
      );
    case 'update_needed':
      return <Banner tone="warning" title="Update the app to use this" body={node.reason} />;
    case 'failed':
      return (
        <Banner tone="critical" title="This phone’s settings can’t be read" body={node.reason} />
      );
  }
}
