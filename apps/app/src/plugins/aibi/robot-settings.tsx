import { ROBOT_PLUGIN_ID } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { href } from '../../app-shell/hrefs';
import { ListRow } from '../../components/list-row';
import { NavRow } from '../../components/rows';
import { List } from '../../components/section';
import { useMinute } from '../../store/clock';
import { PluginStreamSection } from '../shared/plugin-stream-section';
import { usePluginDevice } from '../shared/use-plugin-device';
import { robotNotice, useRobotStatus } from './aibi-data';
import { lastContactText } from './aibi-text';
import { serverRows } from './server-rows';

function Rows(): ReactNode {
  const device = usePluginDevice('robot');
  const now = useMinute();
  return (
    <PluginStreamSection stream={useRobotStatus()} pluginId={ROBOT_PLUGIN_ID} notice={robotNotice}>
      {(status) => (
        <List inset title="Status">
          {serverRows(status)}
          <ListRow
            icon="bot"
            title="AIBI"
            subtitle={`Last heard from ${lastContactText(status, now)}`}
            {...(device === null ? {} : { href: href.device(device), chevron: true })}
          />
        </List>
      )}
    </PluginStreamSection>
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
