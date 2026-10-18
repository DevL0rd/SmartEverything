import type { RobotStatus } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { Badge } from '../../components/badge';
import { ListRow } from '../../components/list-row';
import { joinParts } from '../../format/text';
import { LISTENER_BADGE } from './aibi-data';

export function serverRows(status: RobotStatus): readonly ReactNode[] {
  const server = LISTENER_BADGE[status.server.state];
  const dns = LISTENER_BADGE[status.dns.state];
  return [
    <ListRow
      key="server"
      icon="server"
      title="Answers AIBI"
      subtitle={joinParts([
        `Ports ${String(status.ports.http)} and ${String(status.ports.https)}`,
        status.address,
      ])}
      trailing={<Badge label={server.label} tone={server.tone} />}
    />,
    <ListRow
      key="dns"
      icon="globe"
      title="Name lookups"
      subtitle={status.dns.reason ?? `DNS on port ${String(status.ports.dns)}`}
      trailing={<Badge label={dns.label} tone={dns.tone} />}
    />,
  ];
}
