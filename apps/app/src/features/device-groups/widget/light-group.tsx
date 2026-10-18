import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import type { DeviceTarget } from '@smarteverything/domain';
import { Skeleton } from '../../../components/skeleton';
import {
  frameClassOf,
  WidgetEmpty,
  WidgetFrame,
  WidgetGone,
  WidgetSurface,
  type WidgetFrameBox,
} from '../../../components/widget-board';
import { groupSummary, memberNoun } from '../group-summary';
import { TallFace } from './face-tall';
import { SmallFace, StripFace, TightFace } from './faces-compact';
import { MediumFace, WideFace } from './faces-mid';
import { useGroupControls, type GroupControls } from './use-group-controls';
import { useGroupLoad, type GroupData } from './use-group-data';

const TIGHT_BELOW = 320;

function Loading({ frame }: { readonly frame: WidgetFrameBox }): ReactNode {
  const tall = ['l', 'xl'].includes(frameClassOf(frame));
  return (
    <WidgetSurface>
      <View className="flex-1 gap-2 p-card-pad">
        <View className="flex-row items-center gap-2">
          <Skeleton shape="circle" />
          <View className="flex-1 gap-1.5">
            <Skeleton shape="text" />
            <Skeleton shape="line" />
          </View>
        </View>
        <Skeleton shape="block" className="h-12" />
        {tall ? <Skeleton shape="block" className="h-11" /> : null}
        {tall ? <Skeleton shape="block" className="h-11" /> : null}
      </View>
    </WidgetSurface>
  );
}

function Empty({ data }: { readonly data: GroupData }): ReactNode {
  return (
    <WidgetFrame title={data.name} icon="bulbGroup" accent="primary">
      <WidgetEmpty
        icon="bulb"
        colour="primary"
        title={`No ${memberNoun(data.lights)}s in this group`}
        body={`Add ${memberNoun(data.lights)}s to control them here.`}
        action={{ label: 'Edit group', href: data.href }}
      />
    </WidgetFrame>
  );
}

function Pad({ children }: { readonly children: ReactNode }): ReactNode {
  return <View className="flex-1 p-card-pad">{children}</View>;
}

function Strip({
  data,
  controls,
  width,
}: {
  readonly data: GroupData;
  readonly controls: GroupControls;
  readonly width: number;
}): ReactNode {
  return width < TIGHT_BELOW ? (
    <TightFace data={data} controls={controls} />
  ) : (
    <StripFace data={data} controls={controls} width={width} />
  );
}

function Face({
  data,
  controls,
  frame,
  allColumns,
  titleHref,
}: {
  readonly data: GroupData;
  readonly controls: GroupControls;
  readonly frame: WidgetFrameBox;
  readonly allColumns: number | null;
  readonly titleHref: Href | undefined;
}): ReactNode {
  const shape = allColumns === null ? frameClassOf(frame) : 'l';
  const props = { data, controls };
  switch (shape) {
    case 's':
      return <SmallFace {...props} />;
    case 'xs':
      return <Strip {...props} width={frame.width} />;
    case 'm':
      return (
        <Pad>
          <MediumFace {...props} width={frame.width} />
        </Pad>
      );
    case 'w':
      return (
        <Pad>
          <WideFace {...props} width={frame.width} height={frame.height} />
        </Pad>
      );
    case 'l':
    case 'xl':
      return (
        <Pad>
          <TallFace
            {...props}
            frame={frame}
            wide={shape === 'xl'}
            allColumns={allColumns}
            titleHref={titleHref}
          />
        </Pad>
      );
  }
}

function Ready({
  data,
  frame,
  allColumns,
  titleHref,
}: {
  readonly data: GroupData;
  readonly frame: WidgetFrameBox;
  readonly allColumns: number | null;
  readonly titleHref: Href | undefined;
}): ReactNode {
  const controls = useGroupControls(data);
  return (
    <WidgetSurface>
      <View
        role="group"
        aria-label={`${data.name}, ${memberNoun(data.lights)} group, ${groupSummary(data.view.state).text}`}
        className="flex-1"
      >
        <Face
          data={data}
          controls={controls}
          frame={frame}
          allColumns={allColumns}
          titleHref={titleHref}
        />
      </View>
      {controls.overlays}
    </WidgetSurface>
  );
}

export function LightGroup({
  target,
  frame,
  allColumns,
  title,
  titleHref,
}: {
  readonly target: DeviceTarget;
  readonly frame: WidgetFrameBox;
  readonly allColumns?: number;
  readonly title?: string;
  readonly titleHref?: Href;
}): ReactNode {
  const load = useGroupLoad(target, title);
  if (load.status === 'loading') return <Loading frame={frame} />;
  if (load.status === 'removed')
    return (
      <WidgetGone
        icon="bulbGroup"
        title="This group was removed"
        body="Its devices keep their settings."
      />
    );
  if (load.data.members.length === 0) return <Empty data={load.data} />;
  return (
    <Ready data={load.data} frame={frame} allColumns={allColumns ?? null} titleHref={titleHref} />
  );
}
