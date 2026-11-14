import { Children, createContext, use, useReducer, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { cn } from '../../design/cn';
import { useIdiom } from '../../design/platform';
import { useThemeSetting } from '../../design/theme';
import { SEMANTIC_SIZES } from '../../design/tokens';
import { BandMember, bandValueOf } from './band-context';
import {
  BAND_FIT_START,
  bandFitAfter,
  isCompact,
  oneRowBand,
  type BandFit,
  type BandLayout,
} from './band-fit';
import { frameClassOf } from './frame-class';
import { useWidgetFrame } from './widget-scope';

const Tail = createContext<ReactNode>(null);

export function ActionBandTail({
  tail,
  children,
}: {
  readonly tail: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  return <Tail value={tail}>{children}</Tail>;
}

export interface BandFitting {
  readonly oneRow: boolean;
  readonly fit: BandFit;
  readonly measure: (layout: BandLayout) => void;
}

function Band({
  items,
  tail,
  fitting,
  lead,
}: {
  readonly items: ReactNode;
  readonly tail: ReactNode;
  readonly fitting: BandFitting;
  readonly lead: 'mt-auto' | 'mt-1.5';
}): ReactNode {
  const idiom = useIdiom();
  const density = useThemeSetting('density');
  const { oneRow, fit, measure } = fitting;
  const band = bandValueOf(idiom, density, oneRow && isCompact(fit));
  const onLayout = oneRow
    ? (event: LayoutChangeEvent): void => {
        const { width, height } = event.nativeEvent.layout;
        const sizes = SEMANTIC_SIZES[idiom][density];
        measure({ width, height, row: Math.max(sizes.touchMin, sizes.controlH) });
      }
    : undefined;
  return (
    <View
      className={cn(lead, 'flex-row flex-wrap items-center justify-end gap-2')}
      pointerEvents="box-none"
      onLayout={onLayout}
    >
      <BandMember value={band}>
        <Tail value={null}>
          {items}
          {tail}
        </Tail>
      </BandMember>
    </View>
  );
}

function OwnBand({
  items,
  tail,
}: {
  readonly items: ReactNode;
  readonly tail: ReactNode;
}): ReactNode {
  const frame = useWidgetFrame();
  const [fit, measure] = useReducer(bandFitAfter, BAND_FIT_START);
  const oneRow = oneRowBand(frame === null ? null : frameClassOf(frame));
  return <Band items={items} tail={tail} fitting={{ oneRow, fit, measure }} lead="mt-auto" />;
}

function useBandItems(children: ReactNode): {
  readonly items: ReactNode;
  readonly tail: ReactNode;
  readonly empty: boolean;
} {
  const tail = use(Tail);
  const items = Children.toArray(children);
  return {
    items,
    tail,
    empty: items.length === 0 && (tail === null || tail === undefined || tail === false),
  };
}

export function ActionBand({ children }: { readonly children?: ReactNode }): ReactNode {
  const { items, tail, empty } = useBandItems(children);
  return empty ? null : <OwnBand items={items} tail={tail} />;
}

function Lead(): ReactNode {
  return <View className="h-1.5" />;
}

export function FittedActionBand({
  fitting,
  filled,
  children,
}: {
  readonly fitting: BandFitting;
  readonly filled: boolean;
  readonly children?: ReactNode;
}): ReactNode {
  const { items, tail, empty } = useBandItems(children);
  if (empty) {
    return <Lead />;
  }
  if (filled) {
    return <Band items={items} tail={tail} fitting={fitting} lead="mt-1.5" />;
  }
  return (
    <>
      <Lead />
      <Band items={items} tail={tail} fitting={fitting} lead="mt-auto" />
    </>
  );
}
