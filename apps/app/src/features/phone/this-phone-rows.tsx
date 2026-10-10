import type { ReactNode } from 'react';
import { Platform, View } from 'react-native';
import type { PhoneNodeStatus } from '../../../modules/health-connect';
import { Banner } from '../../components/banner';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { Text } from '../../components/text';
import { relative } from '../../format/time';
import { useMinute } from '../../store/clock';
import { useLocalPref } from '../../store/local-prefs';
import { useHasScale, usePairedServer } from '../profiles';
import { useWatchLink } from '../watches';
import { CONTEXT_TEXT } from './phone-context-text';
import { setPhoneNodeOn, usePhoneNode } from './phone-node';
import { allowSoundControl, keepRunning } from './phone-permissions';
import { SensorRows } from './phone-sensor-rows';
import { HomeWifiRow } from './home-wifi-row';

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
      onPress={() => void setPhoneNodeOn(!status.enabled, server)}
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
          onPress={() => void keepRunning()}
        />
      )}
    </List>
  );
}

function ControlRows({ status }: { readonly status: PhoneNodeStatus }): ReactNode {
  return (
    <List title="Control from home">
      {status.permissions.dndAccess ? (
        <ListRow title="Ringer and Do Not Disturb" value="Allowed" icon="bellOff" />
      ) : (
        <ListRow
          title="Allow changing the ringer and Do Not Disturb"
          subtitle="Android asks for Do Not Disturb access for this"
          icon="bellOff"
          chevron
          onPress={() => void allowSoundControl()}
        />
      )}
    </List>
  );
}

function ReadyRows({ status }: { readonly status: PhoneNodeStatus }): ReactNode {
  return (
    <View className="gap-section-gap">
      <List>
        <NodeRow status={status} />
        {status.enabled ? <NowRow status={status} /> : null}
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

export function ThisPhoneRows(): ReactNode {
  const node = usePhoneNode();
  switch (node.kind) {
    case 'loading':
      return null;
    case 'ready':
      return <ReadyRows status={node.status} />;
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
