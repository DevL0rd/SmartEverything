import type { ReactNode } from 'react';
import type { HealthRecordType } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { HEALTH_CONNECT_ON_DEVICE } from '../data/health-connect';
import { useThisPhoneSource } from '../data/this-phone';
import { useHealthConnect } from '../data/use-health-connect';
import { SERIES, SERIES_GROUPS } from '../model/catalogue';

interface MissingGroup {
  readonly label: string;
  readonly icon: (typeof SERIES_GROUPS)[number]['icon'];
  readonly types: readonly HealthRecordType[];
}

function missingGroups(
  readable: readonly HealthRecordType[],
  granted: readonly HealthRecordType[],
): readonly MissingGroup[] {
  return SERIES_GROUPS.map((group) => ({
    label: group.label,
    icon: group.icon,
    types: [
      ...new Set(
        SERIES.filter((spec) => spec.group === group.group)
          .map((spec) => spec.type)
          .filter((type) => readable.includes(type) && !granted.includes(type)),
      ),
    ],
  })).filter((group) => group.types.length > 0);
}

function Allow(): ReactNode {
  const controls = useHealthConnect();
  const status = controls.status.data;
  const grants = controls.grants.data;
  if (status?.sdk !== 'available' || grants === undefined) {
    return null;
  }
  const groups = missingGroups(status.readableTypes, grants.types);
  if (groups.length === 0) {
    return null;
  }
  return (
    <List title="More you can add" inset footer="Allow these in Health Connect to see them here.">
      {groups.map((group) => (
        <ListRow
          key={group.label}
          icon={group.icon}
          title={group.label}
          subtitle="Not shared yet"
          href={href.settings.focus('health', 'health-connect')}
          chevron
        />
      ))}
    </List>
  );
}

export function MoreToAllow(): ReactNode {
  const connected = useThisPhoneSource() !== null;
  return HEALTH_CONNECT_ON_DEVICE && connected ? <Allow /> : null;
}
