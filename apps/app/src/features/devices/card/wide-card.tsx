import type { ReactNode, RefObject } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import type { FrameClass } from '../../../components/widget-board';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { ActionBand } from '../../../components/widget-board/action-band';
import { FigureText } from '../../../components/figure';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { cn } from '../../../design/cn';
import type { VisualPx } from '../../device-visuals';
import { LogSlot, useLogFit, type LogFit } from './wide-log';

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

export function wideClassOf(cls: FrameClass): WideClass {
  return isWideClass(cls) ? cls : 'm';
}

export function useWideArt(): { readonly cls: WideClass; readonly px: VisualPx } {
  const cls = wideClassOf(useWidgetFace().cls);
  return { cls, px: WIDE_VISUAL_PX[cls] };
}

export interface WideFrame {
  readonly ref: RefObject<View | null>;
  readonly onLayout: (() => void) | undefined;
}

export interface WideCardProps {
  readonly frame?: WideFrame;
  readonly cls: WideClass;
  readonly summary: string;
  readonly visual: ReactNode;
  readonly title: string;
  readonly titleLines?: 1 | 2 | 3;
  readonly chip?: ReactNode;
  readonly interactiveChip?: boolean;
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
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {caption}
        </Text>
      )}
    </View>
  );
}

function Head({
  title,
  chip,
  titleLines = 1,
}: Pick<WideCardProps, 'title' | 'chip' | 'titleLines'>): ReactNode {
  if (chip === undefined) {
    return (
      <Text variant="body-strong" numberOfLines={titleLines} className="min-w-0">
        {title}
      </Text>
    );
  }
  return (
    <View className="flex-row items-center justify-between gap-2">
      <Text variant="body-strong" numberOfLines={titleLines} className="min-w-0 flex-1">
        {title}
      </Text>
      {chip}
    </View>
  );
}

function Info({
  summary,
  title,
  titleLines,
  chip,
  interactiveChip,
  state,
  figures,
}: Pick<
  WideCardProps,
  'summary' | 'title' | 'titleLines' | 'chip' | 'interactiveChip' | 'state' | 'figures'
>): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={summary}
      pointerEvents={interactiveChip === true ? 'box-none' : 'none'}
      className="min-w-0 gap-0.5"
    >
      <Head title={title} titleLines={titleLines ?? 1} chip={chip} />
      {state}
      {figures === undefined || figures.length === 0 ? null : (
        <View className="flex-row flex-wrap items-end gap-x-3 gap-y-1 pt-0.5">{figures}</View>
      )}
    </View>
  );
}

function boxOf(px: VisualPx): { readonly width: number; readonly height: number } {
  return { width: px, height: px };
}

export function WideArt({
  cls,
  children,
}: {
  readonly cls: WideClass;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View
      style={boxOf(WIDE_VISUAL_PX[cls])}
      className="shrink-0 items-center justify-center self-start"
      pointerEvents="none"
    >
      {children}
    </View>
  );
}

function Graph({
  graph,
  beside,
  onLayout,
}: {
  readonly graph: ReactNode;
  readonly beside: boolean;
  readonly onLayout?: ((event: LayoutChangeEvent) => void) | undefined;
}): ReactNode {
  return graph === undefined || graph === null ? null : (
    <View
      className={cn('min-h-0 min-w-0 flex-1 justify-end', beside && 'self-stretch')}
      aria-hidden
      pointerEvents="none"
      onLayout={onLayout}
    >
      {graph}
    </View>
  );
}

function heightOf(event: LayoutChangeEvent): number {
  return event.nativeEvent.layout.height;
}

interface Measured {
  readonly fit: LogFit | undefined;
}

function roomOf(fit: LogFit | undefined): ((event: LayoutChangeEvent) => void) | undefined {
  return fit === undefined
    ? undefined
    : (event): void => {
        fit.onSlack(heightOf(event));
      };
}

function Spare({ fit }: Measured): ReactNode {
  const room = roomOf(fit);
  return room === undefined ? null : <View className="min-h-0 flex-1" onLayout={room} />;
}

function Beside(props: WideCardProps & Measured): ReactNode {
  return (
    <View className="min-h-0 flex-1 flex-row gap-4" pointerEvents="box-none">
      <View className="min-w-0 flex-1" pointerEvents="box-none">
        <Info {...props} />
        <Spare fit={props.fit} />
      </View>
      <Graph graph={props.graph} beside />
    </View>
  );
}

function Stacked(props: WideCardProps & Measured): ReactNode {
  const { graph, fit } = props;
  if (graph === undefined || graph === null) {
    return (
      <>
        <Info {...props} />
        <Spare fit={fit} />
      </>
    );
  }
  return (
    <>
      <Info {...props} />
      <Graph graph={graph} beside={false} onLayout={roomOf(fit)} />
    </>
  );
}

function Content(props: WideCardProps): ReactNode {
  const { cls, log, ticker } = props;
  const fit = useLogFit();
  const logged = log !== undefined && log !== null;
  const measured = logged ? fit : undefined;
  return (
    <>
      {cls === 'w' ? <Beside {...props} fit={measured} /> : <Stacked {...props} fit={measured} />}
      {logged ? <LogSlot log={log} fit={fit} /> : null}
      {ticker === undefined || ticker === null ? null : <View pointerEvents="none">{ticker}</View>}
    </>
  );
}

export function WideCard(props: WideCardProps): ReactNode {
  const { cls, frame } = props;
  return (
    <View
      ref={frame?.ref}
      onLayout={frame?.onLayout}
      className={cn('flex-1 flex-row', cls === 'm' ? 'gap-3' : 'gap-4')}
      pointerEvents="box-none"
    >
      <WideArt cls={cls}>{props.visual}</WideArt>
      <View className="min-w-0 flex-1 gap-1.5" pointerEvents="box-none">
        <Content {...props} />
        <ActionBand>{props.actions}</ActionBand>
      </View>
    </View>
  );
}
