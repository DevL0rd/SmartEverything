import { Children, createContext, use, useReducer, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { useThemeSetting } from '../../design/theme';
import { SEMANTIC_SIZES } from '../../design/tokens';
import { BandMember, useBandValue } from './band-context';
import { BAND_FIT_START, bandFitAfter, isCompact, oneRowBand } from './band-fit';
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

function useRowLimit(): { readonly oneRow: boolean; readonly row: number } {
  const frame = useWidgetFrame();
  const density = useThemeSetting('density');
  if (frame === null) {
    return { oneRow: false, row: 0 };
  }
  const sizes = SEMANTIC_SIZES[frame.idiom][density];
  return {
    oneRow: oneRowBand(frameClassOf(frame)),
    row: Math.max(sizes.touchMin, sizes.controlH),
  };
}

function Band({ items, tail }: { readonly items: ReactNode; readonly tail: ReactNode }): ReactNode {
  const { oneRow, row } = useRowLimit();
  const [fit, measure] = useReducer(bandFitAfter, BAND_FIT_START);
  const band = useBandValue(oneRow && isCompact(fit));
  const onLayout = oneRow
    ? (event: LayoutChangeEvent): void => {
        const { width, height } = event.nativeEvent.layout;
        measure({ width, height, row });
      }
    : undefined;
  return (
    <View
      className="mt-auto flex-row flex-wrap items-center justify-end gap-2"
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

export function ActionBand({ children }: { readonly children?: ReactNode }): ReactNode {
  const tail = use(Tail);
  const items = Children.toArray(children);
  if (items.length === 0 && (tail === null || tail === undefined || tail === false)) {
    return null;
  }
  return <Band items={items} tail={tail} />;
}
