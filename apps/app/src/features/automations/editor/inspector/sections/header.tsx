import type { ReactNode } from 'react';
import { View } from 'react-native';
import { categoryName } from '@smarteverything/domain';
import { Badge } from '../../../../../components/badge';
import { IconWell } from '../../../../../components/icon-well';
import { isIconName, type IconName } from '../../../../../components/icon';
import { SectionAction } from '../../../../../components/section';
import { Text } from '../../../../../components/text';
import { categoryColour } from '../../../../../design/node-colours';
import { CommittedField } from './committed-field';
import { labelOps } from './edits';
import type { NodeBadge } from './node-view';
import type { SectionProps } from './section-types';

const BADGE_ICON: Readonly<Record<NodeBadge, IconName>> = {
  Trigger: 'automations',
  Value: 'puzzle',
  Block: 'layers',
  Step: 'play',
  'Custom Node': 'box',
};

function headerIcon(kindIcon: string | undefined, badge: NodeBadge): IconName {
  return kindIcon !== undefined && isIconName(kindIcon) ? kindIcon : BADGE_ICON[badge];
}

export function Header({ view, env, actions }: SectionProps): ReactNode {
  const { kind } = view;
  const colour = categoryColour(kind === undefined ? '' : categoryName(kind.category));
  return (
    <View className="gap-3 px-4">
      <View className="flex-row items-center gap-3">
        <IconWell icon={headerIcon(kind?.icon, view.badge)} colour={colour} />
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="title-3" numberOfLines={1}>
            {view.title}
          </Text>
          <View className="flex-row flex-wrap items-center gap-2">
            <Badge label={view.badge} />
            {env.breakpoint ? <Badge label="Pauses here" tone="warning" icon="pause" /> : null}
          </View>
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
      <CommittedField
        label="Name"
        value={view.node.label ?? ''}
        placeholder={kind?.name ?? 'Name'}
        disabled={env.locked}
        onCommit={(text) => {
          actions.apply(labelOps(view.key, text));
        }}
      />
    </View>
  );
}
