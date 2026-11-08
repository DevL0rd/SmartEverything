import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveRoot } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { SegmentBar } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { IconWell } from '../../../components/icon-well';
import { Interactive } from '../../../components/interactive';
import { OverflowButton, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { bytes } from '../../../format/number';
import {
  rootCardOf,
  type DriveStatsKind,
  type DriveStatsVolume,
  type RootCardModel,
} from './root-card-model';
import { SyncStatusLine, useRootSyncLine } from './sync-status-line';

export interface RootCardProps {
  readonly root: DriveRoot;
  readonly volume: DriveStatsVolume | null;
  readonly kinds: readonly DriveStatsKind[];
  readonly menu: readonly MenuItem[];
}

function Title({
  root,
  model,
  menu,
}: {
  readonly root: DriveRoot;
  readonly model: RootCardModel;
  readonly menu: readonly MenuItem[];
}): ReactNode {
  return (
    <View className="flex-row items-center gap-3">
      <Interactive
        href={href.driveRoot(root.id)}
        label={`Open ${root.label}`}
        className="min-h-touch-min min-w-0 flex-1 flex-row items-center gap-3"
      >
        <IconWell icon={model.glyph} colour="viz-2" />
        <View className="min-w-0 flex-1">
          <Text variant="title-3" numberOfLines={1}>
            {root.label}
          </Text>
          <Text
            variant="footnote"
            tone="variant"
            numberOfLines={1}
            className={cn(model.mono && 'font-mono')}
          >
            {model.subtitle}
          </Text>
        </View>
      </Interactive>
      {menu.length === 0 ? null : <OverflowButton items={menu} label={`More for ${root.label}`} />}
    </View>
  );
}

function Badges({ model }: { readonly model: RootCardModel }): ReactNode {
  if (model.badges.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {model.badges.map((badge) => (
        <Badge key={badge.label} label={badge.label} tone={badge.tone} icon={badge.icon} />
      ))}
    </View>
  );
}

function Volume({
  root,
  model,
}: {
  readonly root: DriveRoot;
  readonly model: RootCardModel;
}): ReactNode {
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="footnote" numberOfLines={1} className="tabular">
          {model.used}
        </Text>
        {model.volume === null ? null : (
          <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink tabular">
            {model.volume.caption}
          </Text>
        )}
      </View>
      {model.volume === null ? null : (
        <SegmentBar
          segments={model.volume.segments}
          total={model.volume.total}
          label={`${root.label} on its disk`}
          format={bytes}
        />
      )}
    </View>
  );
}

function Kinds({
  root,
  model,
}: {
  readonly root: DriveRoot;
  readonly model: RootCardModel;
}): ReactNode {
  if (model.kinds.length === 0) return null;
  return (
    <SegmentBar
      segments={model.kinds}
      label={`${root.label} by kind`}
      size="thin"
      split
      legend
      format={bytes}
    />
  );
}

function StateRow({ model }: { readonly model: RootCardModel }): ReactNode {
  return (
    <View className="flex-row items-center gap-2">
      <Icon name={model.state.icon} size={16} tone={model.state.tone} />
      <Text variant="footnote" tone="variant" numberOfLines={1} className="min-w-0 flex-1">
        {model.state.text}
      </Text>
      <Text variant="footnote" tone="variant" numberOfLines={1} className="flex-none tabular">
        {model.items}
      </Text>
    </View>
  );
}

export function RootCard({ root, volume, kinds, menu }: RootCardProps): ReactNode {
  const model = rootCardOf(root, volume, kinds);
  const sync = useRootSyncLine(root);
  return (
    <Card>
      <Title root={root} model={model} menu={menu} />
      <Badges model={model} />
      <Volume root={root} model={model} />
      <Kinds root={root} model={model} />
      <StateRow model={model} />
      {sync === null ? null : (
        <View className="gap-3 border-t-hairline border-outline-variant pt-3">
          <SyncStatusLine line={sync} />
        </View>
      )}
    </Card>
  );
}
