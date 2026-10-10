import type { RobotReport, RobotStatus } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../components/badge';
import { ListRow } from '../../components/list-row';
import { ValueRow } from '../../components/rows';
import { List } from '../../components/section';
import { Skeleton } from '../../components/skeleton';
import { joinParts } from '../../format/text';
import { relative } from '../../format/time';
import { useMinute } from '../../store/clock';
import type { Device } from '../../store/state';
import { PluginNotice, StreamProblem } from '../shared/plugin-notice';
import { LISTENER_BADGE, robotNotice, useRobotStatus } from './aibi-data';
import { conversationText, lastContactText } from './aibi-text';

function placeOf(robot: RobotReport): string | null {
  const place = joinParts([robot.city, robot.country]);
  return place === '' ? null : place;
}

const SHORT_VALUE = 24;

function Fact({
  title,
  value,
}: {
  readonly title: string;
  readonly value: string | null;
}): ReactNode {
  if (value === null || value === '') {
    return null;
  }
  return value.length > SHORT_VALUE ? (
    <ListRow title={title} subtitle={value} />
  ) : (
    <ValueRow title={title} value={value} />
  );
}

function ConnectionRow({
  status,
  device,
}: {
  readonly status: RobotStatus;
  readonly device: Device;
}): ReactNode {
  const now = useMinute();
  const online = device.online;
  return (
    <ListRow
      icon="bot"
      title="Connection"
      subtitle={`Last heard from ${lastContactText(status, now)}`}
      trailing={
        <Badge label={online ? 'Online' : 'Offline'} tone={online ? 'positive' : 'neutral'} />
      }
    />
  );
}

function Facts({
  status,
  device,
}: {
  readonly status: RobotStatus;
  readonly device: Device;
}): ReactNode {
  const { robot } = status;
  return (
    <List title="AIBI">
      <ConnectionRow status={status} device={device} />
      <ValueRow title="Talking" value={conversationText(status)} icon="messageCircle" />
      <Fact title="Firmware" value={robot?.firmware ?? null} />
      <Fact title="Language" value={robot?.language ?? null} />
      <Fact title="Place" value={robot === null ? null : placeOf(robot)} />
      <Fact title="Time zone" value={robot?.timezone ?? null} />
      <Fact title="Update problem" value={robot?.updateError ?? null} />
    </List>
  );
}

function Server({ status }: { readonly status: RobotStatus }): ReactNode {
  const server = LISTENER_BADGE[status.server.state];
  const dns = LISTENER_BADGE[status.dns.state];
  return (
    <List title="This server" footer="AIBI finds it through its network’s DNS.">
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
        subtitle={status.dns.reason ?? `DNS on port ${String(status.ports.dns)}`}
        trailing={<Badge label={dns.label} tone={dns.tone} />}
      />
      <ValueRow
        title="Who answers AIBI"
        value={status.mode === 'local' ? 'This server' : 'Its own cloud'}
      />
    </List>
  );
}

function Requests({ status }: { readonly status: RobotStatus }): ReactNode {
  const now = useMinute();
  if (status.calls.length === 0) {
    return null;
  }
  return (
    <List title="What it asked for">
      {status.calls.map((call) => (
        <ListRow
          key={call.path}
          title={call.path}
          subtitle={relative(call.last, now)}
          value={String(call.count)}
        />
      ))}
    </List>
  );
}

export function RobotSection({ device }: { readonly device: Device }): ReactNode {
  const stream = useRobotStatus();
  if (stream.state === 'waiting') {
    return <Skeleton shape="block" />;
  }
  if (stream.state === 'invalid') {
    return <StreamProblem reason={stream.reason} />;
  }
  const status = stream.value;
  return (
    <View className="gap-section-gap">
      <PluginNotice pluginId="aibi" notice={robotNotice(status)} />
      <Facts status={status} device={device} />
      <Server status={status} />
      <Requests status={status} />
    </View>
  );
}
