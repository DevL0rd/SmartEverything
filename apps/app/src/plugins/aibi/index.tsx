import type { AppPlugin } from '../contract';
import { ActivitySection } from './activity-section';
import { AIBI_PLUGIN, isRobot } from './aibi-data';
import { AIBI_WIDGETS } from './aibi-widgets';
import { ConversationSection } from './conversation-section';
import { MovesSection } from './moves-section';
import { RobotOverview } from './overview';
import { RobotDeviceSettings, RobotPluginStatus } from './robot-settings';
import { RobotSection } from './robot-section';

export const aibiAppPlugin: AppPlugin = {
  id: AIBI_PLUGIN,
  widgets: AIBI_WIDGETS,
  home: (devices) => (devices.some(isRobot) ? AIBI_WIDGETS.map((widget) => widget.type) : []),
  deviceSections: [
    {
      key: 'robot',
      title: 'Robot',
      icon: 'bot',
      applies: isRobot,
      render: (device) => <RobotSection device={device} />,
    },
    {
      key: 'conversation',
      title: 'Conversation',
      icon: 'messageCircle',
      applies: isRobot,
      render: () => <ConversationSection />,
    },
    {
      key: 'moves',
      title: 'Moves',
      icon: 'move',
      applies: isRobot,
      render: (device) => <MovesSection device={device} />,
    },
    {
      key: 'activity-log',
      title: 'Log',
      icon: 'activity',
      applies: isRobot,
      render: () => <ActivitySection />,
    },
  ],
  deviceOverviews: [{ key: 'aibi', applies: isRobot, render: () => <RobotOverview /> }],
  deviceSettings: [{ key: 'aibi', applies: isRobot, render: () => <RobotDeviceSettings /> }],
  settings: () => <RobotPluginStatus />,
};
