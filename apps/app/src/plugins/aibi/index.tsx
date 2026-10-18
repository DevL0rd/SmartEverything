import type { AppPlugin } from '../contract';
import { ActivitySection } from './activity-section';
import { AIBI_PLUGIN, isRobot } from './aibi-data';
import { AIBI_WIDGETS } from './aibi-widgets';
import { ConversationSection } from './conversation-section';
import { MovesSection } from './moves-section';
import { RobotOverview } from './overview';
import { RobotCardFace, RobotTile } from './robot-card';
import { RobotHero } from './robot-hero';
import { RobotQuick, RobotQuickLine } from './robot-quick';
import { RobotDeviceSettings, RobotPluginStatus } from './robot-settings';
import { RobotSection } from './robot-section';

export const aibiAppPlugin: AppPlugin = {
  id: AIBI_PLUGIN,
  widgets: AIBI_WIDGETS,
  home: (devices) => (devices.some(isRobot) ? AIBI_WIDGETS.map((widget) => widget.type) : []),
  deviceCards: [
    {
      key: 'aibi',
      applies: isRobot,
      render: (device, size, showRoom) => (
        <RobotTile device={device} showRoom={showRoom} compact={size === 'tile'} />
      ),
      cell: (device, frame, size) => <RobotCardFace device={device} frame={frame} size={size} />,
      quick: (device) => <RobotQuick device={device} />,
      subtitle: (device) => <RobotQuickLine device={device} />,
      hero: (device) => <RobotHero device={device} />,
    },
  ],
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
      title: 'Robot log',
      icon: 'activity',
      applies: isRobot,
      render: () => <ActivitySection />,
    },
  ],
  deviceOverviews: [
    { key: 'aibi', applies: isRobot, render: (device) => <RobotOverview device={device} /> },
  ],
  deviceSettings: [{ key: 'aibi', applies: isRobot, render: () => <RobotDeviceSettings /> }],
  settings: () => <RobotPluginStatus />,
};
