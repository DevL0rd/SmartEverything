import type { ReactNode } from 'react';
import { View } from 'react-native';
import { categoryName } from '@smarteverything/domain';
import { Badge } from '../../../../../components/badge';
import { IconWell } from '../../../../../components/icon-well';
import { isIconName, type IconName } from '../../../../../components/icon';
import { SectionAction } from '../../../../../components/section';
import { Text } from '../../../../../components/text';
import { categoryColour } from '../../../../../design/node-colours';
import { PluginBadge, usePluginNotice } from '../../canvas/nodes/plugin-badge';
import type { NodeBadge } from './node-view';
import type { SectionProps } from './section-types';

const BADGE_ICON: Readonly<Record<NodeBadge, IconName>> = {
  Trigger: 'automations',
  Value: 'puzzle',
  Step: 'play',
  'Custom Node': 'box',
};

function headerIcon(kindIcon: string | undefined, badge: NodeBadge): IconName {
  return kindIcon !== undefined && isIconName(kindIcon) ? kindIcon : BADGE_ICON[badge];
}

function Badges({
  badge,
  paused,
  kindId,
}: {
  readonly badge: NodeBadge;
  readonly paused: boolean;
  readonly kindId: string;
}): ReactNode {
  const notice = usePluginNotice(kindId);
  if (badge === 'Step' && !paused && notice === null) return null;
  return (
    <View className="flex-row flex-wrap items-center gap-2 pt-1">
      {badge === 'Step' ? null : <Badge label={badge} />}
      {paused ? <Badge label="Pauses here" tone="warning" icon="pause" /> : null}
      {notice === null ? null : <PluginBadge notice={notice} />}
    </View>
  );
}

export function Header({ view, env, actions }: SectionProps): ReactNode {
  const { kind } = view;
  const colour = categoryColour(kind === undefined ? '' : categoryName(kind.category));
  return (
    <View className="flex-row items-start gap-3 px-4">
      <IconWell icon={headerIcon(kind?.icon, view.badge)} colour={colour} />
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="body-strong" numberOfLines={1}>
          {kind?.name ?? view.title}
        </Text>
        {kind === undefined ? null : (
          <Text variant="footnote" tone="variant" numberOfLines={3}>
            {kind.description}
          </Text>
        )}
        <Badges badge={view.badge} paused={env.breakpoint} kindId={view.node.kind} />
      </View>
      {kind === undefined ? null : (
        <SectionAction
          label="Help"
          onPress={() => {
            actions.openHelp(kind.id);
          }}
        />
      )}
    </View>
  );
}
