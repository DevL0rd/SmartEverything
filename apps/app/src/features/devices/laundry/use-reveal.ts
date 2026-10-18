import { useEffect, useRef, useState } from 'react';
import type { ScrollView } from 'react-native';

interface Spot {
  readonly start: number;
  readonly size: number;
}

export interface Reveal {
  readonly attach: (node: ScrollView | null) => void;
  readonly viewport: (size: number) => void;
  readonly track: (key: string | number, start: number, size: number) => void;
}

function same(known: Spot | undefined, spot: Spot): boolean {
  return known?.start === spot.start && known.size === spot.size;
}

export function useReveal(
  axis: 'x' | 'y',
  selected: string | number | undefined,
  version: number,
): Reveal {
  const spots = useRef<Map<string | number, Spot>>(new Map());
  const [arrival, setArrival] = useState(0);
  const [node, setNode] = useState<ScrollView | null>(null);
  const [size, setSize] = useState(0);
  useEffect(() => {
    const spot = selected === undefined ? undefined : spots.current.get(selected);
    if (node === null || spot === undefined || (axis === 'x' && size === 0)) {
      return;
    }
    const at = axis === 'x' ? Math.max(0, spot.start - (size - spot.size) / 2) : spot.start;
    node.scrollTo(axis === 'x' ? { x: at, animated: false } : { y: at, animated: false });
  }, [arrival, axis, node, selected, size, version]);
  return {
    attach: setNode,
    viewport: setSize,
    track: (key, start, length): void => {
      const spot = { start, size: length };
      if (same(spots.current.get(key), spot)) {
        return;
      }
      spots.current.set(key, spot);
      if (key === selected) {
        setArrival((count) => count + 1);
      }
    },
  };
}
