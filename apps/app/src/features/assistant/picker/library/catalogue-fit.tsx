import { createContext, use, useLayoutEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

type Part = 'tools' | 'results' | 'listFooter' | 'selection';
type Measurements = Readonly<Partial<Record<Part, number | null>>>;
type Measure = (part: Part, height: number | null) => void;

export const CatalogueFit = createContext<Measure | null>(null);

const RESULTS_GAP = 8;

export function catalogueHeight(
  maxHeight: number,
  headingHeight: number,
  { tools, results, listFooter, selection }: Measurements,
): number {
  if (typeof tools !== 'number' || typeof results !== 'number') return maxHeight;
  return Math.min(
    maxHeight,
    headingHeight + tools + RESULTS_GAP + results + (listFooter ?? 0) + (selection ?? 0),
  );
}

export function useCatalogueFit(): readonly [Measurements, Measure] {
  const [measurements, setMeasurements] = useState<Measurements>({});
  const [measure] = useState<Measure>(() => (part: Part, height: number | null): void => {
    setMeasurements((current) =>
      current[part] === height ? current : { ...current, [part]: height },
    );
  });
  return [measurements, measure];
}

export function useCatalogueRows(height: number): void {
  const measure = use(CatalogueFit);
  useLayoutEffect(() => {
    if (measure === null) return undefined;
    measure('results', height);
    return (): void => {
      measure('results', null);
    };
  }, [height, measure]);
}

export function CatalogueMeasure({
  part,
  children,
}: {
  readonly part: Part;
  readonly children: ReactNode;
}): ReactNode {
  const measure = use(CatalogueFit);
  useLayoutEffect(() => {
    if (measure === null) return undefined;
    return (): void => {
      measure(part, null);
    };
  }, [measure, part]);
  if (measure === null) return children;
  return (
    <View
      className="shrink-0"
      onLayout={(event): void => {
        const { height } = event.nativeEvent.layout;
        if (height > 0) measure(part, height);
      }}
    >
      {children}
    </View>
  );
}
