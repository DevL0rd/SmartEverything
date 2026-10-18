import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { FrameClass } from '../../../components/widget-board';
import { FigureText } from '../../../components/figure';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { cn } from '../../../design/cn';
import type { VisualPx } from '../../device-visuals';

export type WideClass = 'm' | 'w' | 'l' | 'xl';

const WIDE_CLASSES: ReadonlySet<FrameClass> = new Set(['m', 'w', 'l', 'xl']);

export function isWideClass(cls: FrameClass): cls is WideClass {
  return WIDE_CLASSES.has(cls);
}

export const WIDE_VISUAL_PX: Readonly<Record<WideClass, VisualPx>> = {
  m: 96,
  w: 96,
  l: 128,
  xl: 128,
};

export const WIDE_MAX_ACTIONS: Readonly<Record<WideClass, number>> = {
  m: 2,
  w: 3,
  l: 6,
  xl: 6,
};

export const WIDE_MAX_FIGURES = 3;

const PANEL_CHART_HEIGHT = 120;

export interface WideCardProps {
  readonly cls: WideClass;
  readonly summary: string;
  readonly visual: ReactNode;
  readonly title: string;
  readonly chip?: ReactNode;
  readonly state?: ReactNode;
  readonly figures?: readonly ReactNode[];
  readonly graph?: ReactNode;
  readonly actions?: readonly ReactNode[];
  readonly ticker?: ReactNode;
  readonly log?: ReactNode;
}

export interface WideFigureProps {
  readonly value: string;
  readonly unit?: string;
  readonly caption?: string;
  readonly tone?: Tone;
  readonly stale?: boolean;
}

export function WideFigure({
  value,
  unit,
  caption,
  tone = 'default',
  stale = false,
}: WideFigureProps): ReactNode {
  return (
    <View className="min-w-0 shrink-0">
      <FigureText text={value} unit={unit} size="m" tone={tone} stale={stale} />
      {caption === undefined ? null : (
        <Text variant="caption" tone="faint" numberOfLines={1}>
          {caption}
        </Text>
      )}
    </View>
  );
}

function Head({ title, chip }: { readonly title: string; readonly chip: ReactNode }): ReactNode {
  return (
    <View className="flex-row items-center justify-between gap-2">
      <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
        {title}
      </Text>
      {chip}
    </View>
  );
}

function Info({
  summary,
  title,
  chip,
  state,
  figures,
}: Pick<WideCardProps, 'summary' | 'title' | 'chip' | 'state' | 'figures'>): ReactNode {
  return (
    <View accessible accessibilityLabel={summary} pointerEvents="none" className="min-w-0 gap-0.5">
      <Head title={title} chip={chip} />
      {state}
      {figures === undefined || figures.length === 0 ? null : (
        <View className="flex-row items-end gap-3 overflow-hidden pt-0.5">
          {figures.slice(0, WIDE_MAX_FIGURES)}
        </View>
      )}
    </View>
  );
}

function VisualSlot({
  cls,
  visual,
}: {
  readonly cls: WideClass;
  readonly visual: ReactNode;
}): ReactNode {
  const box = { width: WIDE_VISUAL_PX[cls] };
  return (
    <View style={box} className="items-center justify-center self-center" pointerEvents="none">
      {visual}
    </View>
  );
}

function Graph({
  graph,
  className,
}: {
  readonly graph: ReactNode;
  readonly className?: string;
}): ReactNode {
  return graph === undefined || graph === null ? null : (
    <View className={cn('min-h-0 min-w-0 justify-end', className)} aria-hidden pointerEvents="none">
      {graph}
    </View>
  );
}

function Actions({
  cls,
  actions,
  ticker,
  wrap = false,
}: {
  readonly cls: WideClass;
  readonly actions: readonly ReactNode[] | undefined;
  readonly ticker: ReactNode;
  readonly wrap?: boolean;
}): ReactNode {
  const shown = (actions ?? []).slice(0, WIDE_MAX_ACTIONS[cls]);
  if (shown.length === 0 && ticker === undefined) {
    return null;
  }
  return (
    <View
      className={cn('flex-row items-center gap-2', wrap && 'flex-wrap')}
      pointerEvents="box-none"
    >
      {shown}
      {ticker === undefined ? null : (
        <View className="min-w-0 flex-1 items-end" pointerEvents="none">
          {ticker}
        </View>
      )}
    </View>
  );
}

function RowCard(props: WideCardProps): ReactNode {
  return (
    <View className="flex-1 gap-1.5" pointerEvents="box-none">
      <View className="flex-1 flex-row gap-3" pointerEvents="box-none">
        <VisualSlot cls={props.cls} visual={props.visual} />
        <View className="min-w-0 flex-1 gap-1" pointerEvents="box-none">
          <Info {...props} />
          <Graph graph={props.graph} className="flex-1" />
        </View>
      </View>
      <Actions cls={props.cls} actions={props.actions} ticker={props.ticker} />
    </View>
  );
}

function SplitCard(props: WideCardProps): ReactNode {
  return (
    <View className="flex-1 gap-1.5" pointerEvents="box-none">
      <View className="flex-1 flex-row gap-4" pointerEvents="box-none">
        <VisualSlot cls={props.cls} visual={props.visual} />
        <View className="min-w-0 flex-1 justify-center" pointerEvents="box-none">
          <Info {...props} />
        </View>
        <Graph graph={props.graph} className="min-w-0 flex-1" />
      </View>
      <Actions cls={props.cls} actions={props.actions} ticker={props.ticker} />
    </View>
  );
}

function PanelCard(props: WideCardProps): ReactNode {
  const { cls, actions, ticker, log, graph } = props;
  const height = { height: PANEL_CHART_HEIGHT };
  return (
    <View className="flex-1 gap-3" pointerEvents="box-none">
      <View className="flex-row items-center gap-4" pointerEvents="box-none">
        <VisualSlot cls={cls} visual={props.visual} />
        <View className="min-w-0 flex-1" pointerEvents="box-none">
          <Info {...props} />
        </View>
      </View>
      {graph === undefined ? null : (
        <View style={height} className="w-full" aria-hidden pointerEvents="none">
          {graph}
        </View>
      )}
      <Actions cls={cls} actions={actions} ticker={undefined} wrap />
      {log}
      {ticker === undefined ? null : <View pointerEvents="none">{ticker}</View>}
    </View>
  );
}

export function WideCard(props: WideCardProps): ReactNode {
  switch (props.cls) {
    case 'm':
      return <RowCard {...props} />;
    case 'w':
      return <SplitCard {...props} />;
    case 'l':
    case 'xl':
      return <PanelCard {...props} />;
  }
}
