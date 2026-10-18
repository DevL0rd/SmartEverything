import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import type { DeviceTarget } from '@smarteverything/domain';
import { Interactive } from '../../components/interactive';
import { WIDGET_SURFACE } from '../../components/widget-board';
import { useIdiom } from '../../design/platform';
import { cn } from '../../design/cn';
import { miniStageOf } from './model/mini-stage';
import { GroupGlyph, GroupTitle, MasterPower } from './widget/group-header';
import { MiniStageDots } from './widget/mini-stage';
import { useGroupLoad, type GroupData } from './widget/use-group-data';

const CARD_BOUNDS = { minWidth: 232, maxWidth: 280 } as const;

function CardBody({ data }: { readonly data: GroupData }): ReactNode {
  const { state } = data.view;
  return (
    <View className="min-w-0 flex-1 gap-1.5">
      <View className="min-w-0 flex-row items-center gap-2">
        <GroupGlyph on={state.on > 0} lights={data.lights} />
        <GroupTitle name={data.name} state={state} strong />
      </View>
      <MiniStageDots
        stage={miniStageOf(
          data.members.map((member) => member.id),
          data.view,
        )}
      />
    </View>
  );
}

export function DeviceGroupCard({
  target,
  title,
  href,
}: {
  readonly target: DeviceTarget;
  readonly title?: string;
  readonly href?: Href;
}): ReactNode {
  const load = useGroupLoad(target, title);
  const touch = useIdiom() === 'touch';
  if (load.status !== 'ready') return null;
  const { data } = load;
  const { state } = data.view;
  return (
    <View
      role="group"
      aria-label={data.name}
      className={cn(
        'flex-row items-center gap-1 pl-3 pr-1',
        WIDGET_SURFACE,
        touch ? 'h-24' : 'h-20',
      )}
      style={CARD_BOUNDS}
    >
      <Interactive
        href={href ?? data.href}
        label={`${data.name}, see all`}
        className="min-w-0 flex-1 rounded-sm py-2"
        layerClassName="rounded-sm"
      >
        <CardBody data={data} />
      </Interactive>
      <MasterPower state={state} master={data.master} name={data.name} lights={data.lights} />
    </View>
  );
}
