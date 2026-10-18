import type { ReactNode } from 'react';
import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ThemeScope } from '../../../../design/theme-scope';
import { EdgeScrim } from '../../../../components/edge-scrim';
import { Icon } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { entering, useMotion } from '../../../../design/motion';
import { isNative } from '../../../../design/platform';
import type { CallView } from '../call-state';
import type { CallLayout } from '../model/call-layout';
import {
  isMediaStage,
  selfViewOf,
  stageNameOf,
  stageOf,
  type StageKind,
} from '../model/call-stage';
import { AiTile } from './ai-tile';
import { SelfViewTile, type TileBox, type TileCorner } from './self-view-tile';
import { SightPreview } from './sight-preview';
import {
  CameraStage,
  HomeStage,
  OrbStage,
  ScreenPanel,
  ScreenPreviewStage,
  type StageActions,
} from './stage-views';

export interface CallStageProps {
  readonly call: CallView;
  readonly layout: CallLayout;
  readonly level: SharedValue<number>;
  readonly stoppable: boolean;
  readonly actions: StageActions & { readonly onFlip: () => void };
  readonly captions: ReactNode;
}

function FlipButton({ onFlip }: { readonly onFlip: () => void }): ReactNode {
  return (
    <Interactive
      label="Switch camera"
      onPress={onFlip}
      className="size-12 items-center justify-center rounded-full bg-black/55"
      layerClassName="rounded-full"
    >
      <ThemeScope theme="dark">
        <Icon name="switchCamera" size={24} tone="default" />
      </ThemeScope>
    </Interactive>
  );
}

function NameChip({
  text,
  icon,
}: {
  readonly text: string;
  readonly icon: 'camera' | 'screenShare';
}): ReactNode {
  return (
    <ThemeScope theme="dark">
      <View className="absolute bottom-3 left-3 flex-row items-center gap-1.5 rounded-full bg-black/60 px-3 py-1">
        <Icon name={icon} size={16} tone="default" />
        <Text variant="caption">{text}</Text>
      </View>
    </ThemeScope>
  );
}

function MainView({
  call,
  kind,
  swapped,
  actions,
}: {
  readonly call: CallView;
  readonly kind: StageKind;
  readonly swapped: boolean;
  readonly actions: CallStageProps['actions'];
}): ReactNode {
  if (swapped) {
    return (
      <View className="absolute inset-0 overflow-hidden bg-surface-2">
        <SightPreview
          slot="self"
          fit="cover"
          label="Your camera"
          facing={call.video.facing}
          light={false}
        />
      </View>
    );
  }
  switch (kind) {
    case 'camera':
      return <CameraStage call={call} actions={actions} />;
    case 'home':
      return <HomeStage call={call} />;
    case 'screen-preview':
      return <ScreenPreviewStage call={call} />;
    case 'screen-panel':
    case 'orb':
      return null;
  }
}

function useTileState(): {
  readonly box: TileBox;
  readonly onLayout: (event: LayoutChangeEvent) => void;
  readonly corner: TileCorner | null;
  readonly setCorner: (corner: TileCorner) => void;
  readonly swapped: boolean;
  readonly swap: () => void;
} {
  const [box, setBox] = useState<TileBox>({ width: 0, height: 0 });
  const [corner, setCorner] = useState<TileCorner | null>(null);
  const [swapped, setSwapped] = useState(false);
  return {
    box,
    onLayout: (event): void => {
      setBox(event.nativeEvent.layout);
    },
    corner,
    setCorner,
    swapped,
    swap: (): void => {
      setSwapped((current) => !current);
    },
  };
}

function TileColumn({
  call,
  kind,
  level,
  stoppable,
  actions,
}: Pick<CallStageProps, 'call' | 'level' | 'stoppable' | 'actions'> & {
  readonly kind: StageKind;
}): ReactNode {
  const flip = kind === 'camera' && call.video.facing !== 'external' && call.video.camera === 'on';
  return (
    <View className="absolute right-3 top-3 items-end gap-2">
      <AiTile call={call} level={level} stoppable={stoppable} onStop={actions.onStopTalking} />
      {flip ? <FlipButton onFlip={actions.onFlip} /> : null}
    </View>
  );
}

function SelfTile({
  call,
  kind,
  layout,
  bleed,
  tiles,
}: {
  readonly call: CallView;
  readonly kind: StageKind;
  readonly layout: CallLayout;
  readonly bleed: boolean;
  readonly tiles: ReturnType<typeof useTileState>;
}): ReactNode {
  if (!selfViewOf(call, kind) || tiles.box.width === 0) {
    return null;
  }
  return (
    <SelfViewTile
      video={call.video}
      box={tiles.box}
      wide={layout.roomy}
      corner={tiles.corner ?? (kind === 'screen-panel' || bleed ? 'top-left' : 'bottom-right')}
      swappable={!isNative()}
      slot={tiles.swapped ? 'sent' : 'self'}
      onCorner={tiles.setCorner}
      onSwap={tiles.swap}
    />
  );
}

function frameOf(kind: StageKind, bleed: boolean): string {
  if (!isMediaStage(kind)) {
    return 'min-h-0 w-full flex-1 items-center justify-center overflow-hidden';
  }
  return cn(
    'min-h-0 w-full flex-1 overflow-hidden bg-bg',
    !bleed && 'max-w-reading self-center rounded-xl',
  );
}

interface StageContentProps extends Pick<
  CallStageProps,
  'call' | 'level' | 'stoppable' | 'actions'
> {
  readonly kind: StageKind;
  readonly layout: CallLayout;
  readonly swapped: boolean;
}

function StageContent({
  call,
  kind,
  layout,
  swapped,
  level,
  stoppable,
  actions,
}: StageContentProps): ReactNode {
  const motion = useMotion();
  if (kind === 'orb') {
    return (
      <OrbStage
        call={call}
        level={level}
        size={layout.orb}
        stoppable={stoppable}
        onStopTalking={actions.onStopTalking}
      />
    );
  }
  if (kind === 'screen-panel') {
    return <ScreenPanel call={call} actions={actions} />;
  }
  return (
    <Animated.View {...entering(motion, FadeIn)} className="absolute inset-0">
      <MainView call={call} kind={kind} swapped={swapped} actions={actions} />
    </Animated.View>
  );
}

function BleedCaptions({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <View className="absolute inset-x-0 bottom-0 px-4 pb-3 pt-10">
      <EdgeScrim edge="bottom" />
      {children}
    </View>
  );
}

export function CallStage(props: CallStageProps): ReactNode {
  const { call, layout, level, stoppable, actions, captions } = props;
  const kind = stageOf(call);
  const tiles = useTileState();
  const media = isMediaStage(kind);
  const bleed = layout.kind === 'column' && !layout.roomy && media;
  const tileColumn = media || kind === 'screen-panel';
  return (
    <View onLayout={tiles.onLayout} className={frameOf(kind, bleed)}>
      <StageContent
        call={call}
        kind={kind}
        layout={layout}
        swapped={selfViewOf(call, kind) ? tiles.swapped : false}
        level={level}
        stoppable={stoppable}
        actions={actions}
      />
      {media && !bleed ? (
        <NameChip
          text={stageNameOf(call, kind)}
          icon={kind === 'screen-preview' ? 'screenShare' : 'camera'}
        />
      ) : null}
      {bleed ? <BleedCaptions>{captions}</BleedCaptions> : null}
      {tileColumn ? (
        <TileColumn call={call} kind={kind} level={level} stoppable={stoppable} actions={actions} />
      ) : null}
      <SelfTile call={call} kind={kind} layout={layout} bleed={bleed} tiles={tiles} />
    </View>
  );
}
