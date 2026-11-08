import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import type { CameraPresetId } from '../../../../components/house-map/3d/render-core-orbit';
import type { ChromeBox, StageInsets } from '../../../../components/house-map/stage-fit';
import {
  StageHost,
  type StageLiveProps,
} from '../../../../components/house-map/live-visibility/stage-host';
import { cn } from '../../../../design/cn';
import { NO_SELECTION, type HomeMapSelection } from '../../model/selection';
import {
  NO_CHROME_INSETS,
  useChromeBoxes,
  type ChromeMeasure,
  type ChromePiece,
} from './chrome-boxes';
import { PlaceSwitchers, placesShown, type StageMaps } from './map-switcher';
import {
  StageTools,
  StatusPill,
  ViewSwitcher,
  type StageFloors,
  type StageToggle,
  type StagePill,
  type StageViewOption,
} from './stage-chrome';

export type StageVariant = 'page' | 'pinned' | 'hero' | 'face' | 'full' | 'plain';

export interface View3d {
  readonly preset: CameraPresetId;
  readonly fitSeq: number;
  readonly follow: boolean;
}

export interface StageContext {
  readonly variant: StageVariant;
  readonly view3d: View3d;
  readonly chrome: readonly ChromeBox[];
  readonly chromeInsets: StageInsets;
  readonly focus: HomeMapSelection;
}

export type StageContent =
  | { readonly kind: 'direct'; readonly render: (context: StageContext) => ReactNode }
  | {
      readonly kind: 'live';
      readonly id: string;
      readonly still: ReactNode;
      readonly modalCovered?: boolean;
      readonly render: (context: StageContext, live: StageLiveProps) => ReactNode;
    };

export interface StageToolset {
  readonly tools3d: boolean;
  readonly follow?: boolean;
  readonly lights?: StageToggle | undefined;
  readonly onLocate?: (() => void) | undefined;
  readonly onFullScreen?: (() => void) | undefined;
  readonly onEdit?: (() => void) | undefined;
}

export interface StageCamera {
  readonly preset: CameraPresetId;
  readonly onPreset: (preset: CameraPresetId) => void;
}

export interface StageProps<V extends string> {
  readonly content: StageContent;
  readonly views: readonly StageViewOption<V>[];
  readonly view: V;
  readonly onViewChange: (view: V) => void;
  readonly tools: StageToolset | null;
  readonly floors?: StageFloors | undefined;
  readonly camera?: StageCamera | undefined;
  readonly maps?: StageMaps | undefined;
  readonly pill?: StagePill | null;
  readonly notices?: ReactNode;
  readonly focus?: HomeMapSelection;
  readonly summary?: string | undefined;
  readonly variant?: StageVariant;
  readonly className?: string | undefined;
  readonly style?: StyleProp<ViewStyle>;
}

interface Controls {
  readonly view3d: View3d;
  readonly setPreset: (preset: CameraPresetId) => void;
  readonly toggleFollow: () => void;
  readonly fit: () => void;
}

function focusKey(focus: HomeMapSelection): string {
  if (focus.kind === 'room') return `room:${focus.roomId}`;
  return focus.kind === 'device' ? `device:${focus.deviceId}` : 'none';
}

function useControls(focus: HomeMapSelection, camera: StageCamera | undefined): Controls {
  const [own, setOwn] = useState<CameraPresetId>('angled');
  const [fitSeq, setFitSeq] = useState(0);
  const [follow, setFollow] = useState(false);
  const key = focusKey(focus);
  const [fittedFor, setFittedFor] = useState(key);
  if (fittedFor !== key) {
    setFittedFor(key);
    setFitSeq((seq) => seq + 1);
  }
  return {
    view3d: { preset: camera?.preset ?? own, fitSeq, follow },
    setPreset: camera?.onPreset ?? setOwn,
    toggleFollow: (): void => {
      setFollow((on) => !on);
    },
    fit: (): void => {
      setFollow(false);
      setFitSeq((seq) => seq + 1);
    },
  };
}

const CHROMED: ReadonlySet<StageVariant> = new Set(['page', 'pinned', 'hero', 'full']);

function contextOf<V extends string>(
  props: StageProps<V>,
  controls: Controls,
  measure: ChromeMeasure,
): StageContext {
  const variant = props.variant ?? 'page';
  const { tools } = props;
  const following = tools?.follow === true && tools.tools3d && controls.view3d.follow;
  return {
    variant,
    view3d: { ...controls.view3d, follow: following },
    chrome: CHROMED.has(variant) ? measure.boxes : [],
    chromeInsets: CHROMED.has(variant) ? measure.insets : NO_CHROME_INSETS,
    focus: props.focus ?? NO_SELECTION,
  };
}

function Content({
  content,
  context,
}: {
  readonly content: StageContent;
  readonly context: StageContext;
}): ReactNode {
  if (content.kind === 'direct') {
    return content.render(context);
  }
  return (
    <StageHost
      id={content.id}
      still={content.still}
      modalCovered={content.modalCovered === true}
      renderLive={(live) => content.render(context, live)}
    />
  );
}

function hasNotices<V extends string>(props: StageProps<V>): boolean {
  return props.notices !== null && props.notices !== undefined;
}

export function stagePieces<V extends string>(props: StageProps<V>): readonly ChromePiece[] {
  return [
    ...(props.views.length > 1 ? (['switcher'] as const) : []),
    ...(placesShown(props.maps, props.floors) ? (['floors'] as const) : []),
    ...(props.pill === null || props.pill === undefined ? [] : (['pill'] as const)),
    ...(props.tools === null ? [] : (['tools'] as const)),
    ...(hasNotices(props) ? (['notes'] as const) : []),
  ];
}

function TopBar<V extends string>({
  stage,
  measure,
}: {
  readonly stage: StageProps<V>;
  readonly measure: ChromeMeasure;
}): ReactNode {
  return (
    <View
      pointerEvents="box-none"
      onLayout={measure.onBar('top')}
      className="absolute inset-x-3 top-3 flex-row-reverse flex-wrap items-start gap-2"
    >
      <ViewSwitcher
        views={stage.views}
        value={stage.view}
        onChange={stage.onViewChange}
        onLayout={measure.onPiece('switcher')}
      />
      <PlaceSwitchers
        maps={stage.maps}
        floors={stage.floors}
        onLayout={measure.onPiece('floors')}
      />
    </View>
  );
}

function toggleOf(
  offered: boolean | undefined,
  on: boolean,
  onToggle: () => void,
): StageToggle | undefined {
  return offered === true ? { on, onToggle } : undefined;
}

function PillSlot({
  pill,
  onLayout,
}: {
  readonly pill: StagePill | null;
  readonly onLayout: (event: LayoutChangeEvent) => void;
}): ReactNode {
  if (pill === null) return null;
  return (
    <View pointerEvents="none" onLayout={onLayout} className="max-w-full items-start">
      <StatusPill pill={pill} />
    </View>
  );
}

function BottomBar<V extends string>({
  stage,
  controls,
  measure,
}: {
  readonly stage: StageProps<V>;
  readonly controls: Controls;
  readonly measure: ChromeMeasure;
}): ReactNode {
  const { tools } = stage;
  return (
    <View
      pointerEvents="box-none"
      onLayout={measure.onBar('bottom')}
      className="absolute inset-x-3 bottom-3 flex-row-reverse flex-wrap-reverse items-end gap-2"
    >
      {tools === null ? null : (
        <StageTools
          tools3d={tools.tools3d}
          preset={controls.view3d.preset}
          onPreset={controls.setPreset}
          follow={toggleOf(tools.follow, controls.view3d.follow, controls.toggleFollow)}
          lights={tools.lights}
          onFit={controls.fit}
          onLocate={tools.onLocate}
          onFullScreen={tools.onFullScreen}
          onEdit={tools.onEdit}
          onLayout={measure.onPiece('tools')}
        />
      )}
      {hasNotices(stage) ? (
        <View
          pointerEvents="box-none"
          onLayout={measure.onPiece('notes')}
          className="min-w-48 shrink"
        >
          {stage.notices}
        </View>
      ) : null}
      <PillSlot pill={stage.pill ?? null} onLayout={measure.onPiece('pill')} />
    </View>
  );
}

const FRAMES: Readonly<Record<Exclude<StageVariant, 'face' | 'plain'>, string>> = {
  page: 'aspect-19/15 w-full rounded-lg',
  pinned: 'size-full',
  hero: 'w-full rounded-lg',
  full: 'w-full flex-1',
};

export function Stage<V extends string>(props: StageProps<V>): ReactNode {
  const { className, variant = 'page' } = props;
  const controls = useControls(props.focus ?? NO_SELECTION, props.camera);
  const measure = useChromeBoxes(stagePieces(props));
  const context = contextOf(props, controls, measure);
  if (variant === 'plain') {
    return (
      <View className={cn(className)} style={props.style}>
        <Content content={props.content} context={context} />
      </View>
    );
  }
  if (variant === 'face') {
    return (
      <View
        role="group"
        aria-label={props.summary}
        className={cn('flex-1 overflow-hidden bg-surface-2', className)}
        style={props.style}
      >
        <Content content={props.content} context={context} />
      </View>
    );
  }
  return (
    <View
      role="group"
      aria-label={props.summary}
      className={cn('items-center overflow-hidden bg-surface-2', FRAMES[variant], className)}
      style={props.style}
    >
      <View className="absolute inset-0">
        <Content content={props.content} context={context} />
      </View>
      <View pointerEvents="box-none" onLayout={measure.onOrigin} className="absolute inset-0">
        <TopBar stage={props} measure={measure} />
        <BottomBar stage={props} controls={controls} measure={measure} />
      </View>
    </View>
  );
}
