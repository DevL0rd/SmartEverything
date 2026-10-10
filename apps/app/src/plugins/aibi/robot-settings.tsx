import { ROBOT_PLUGIN_ID } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../app-shell/hrefs';
import { Badge } from '../../components/badge';
import { ListRow } from '../../components/list-row';
import { NavRow } from '../../components/rows';
import { List } from '../../components/section';
import { Skeleton } from '../../components/skeleton';
import { joinParts } from '../../format/text';
import { useMinute } from '../../store/clock';
import { PluginNotice, StreamProblem } from '../shared/plugin-notice';
import { LISTENER_BADGE, robotNotice, useRobotDevice, useRobotStatus } from './aibi-data';
import { lastContactText } from './aibi-text';

function Rows(): ReactNode {
  const stream = useRobotStatus();
  const device = useRobotDevice();
  const now = useMinute();
  if (stream.state === 'waiting') {
    return <Skeleton shape="block" />;
  }
  if (stream.state === 'invalid') {
    return <StreamProblem reason={stream.reason} />;
  }
  const status = stream.value;
  const server = LISTENER_BADGE[status.server.state];
  const dns = LISTENER_BADGE[status.dns.state];
  return (
    <View className="gap-section-gap">
      <PluginNotice pluginId={ROBOT_PLUGIN_ID} notice={robotNotice(status)} />
      <List inset title="Status">
        <ListRow
          icon="server"
          title="Answers AIBI"
          subtitle={joinParts([
            `Ports ${String(status.ports.http)} and ${String(status.ports.https)}`,
            status.address,
          ])}
          trailing={<Badge label={server.label} tone={server.tone} />}
        />
        <ListRow
          icon="globe"
          title="Name lookups"
          subtitle={status.dns.reason ?? `Port ${String(status.ports.dns)}`}
          trailing={<Badge label={dns.label} tone={dns.tone} />}
        />
        <ListRow
          icon="bot"
          title="AIBI"
          subtitle={`Last heard from ${lastContactText(status, now)}`}
          {...(device === null ? {} : { href: href.device(device), chevron: true })}
        />
      </List>
    </View>
  );
}

export function RobotPluginStatus(): ReactNode {
  return <Rows />;
}

export function RobotDeviceSettings(): ReactNode {
  return (
    <List title="Robot server">
      <NavRow
        title="Plugin settings"
        subtitle="Personality, moves, talking, network and privacy"
        icon="settings"
        href={href.pluginSettings(ROBOT_PLUGIN_ID)}
      />
    </List>
  );
}
