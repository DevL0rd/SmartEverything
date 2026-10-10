import { useCallback, useEffect, useId, useState } from 'react';
import { Keyboard, type View } from 'react-native';
import { ValueStore, useValue } from '../design/external-store';

export type ObstacleEdge = 'bottom' | 'start';

export interface Frame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Obstacle {
  readonly edge: ObstacleEdge;
  readonly frame: Frame;
}

export interface ToastRoom {
  readonly bottom: number | null;
  readonly start: number | null;
}

export interface MeasuredView {
  readonly attach: (node: View | null) => void;
  readonly onLayout: () => void;
}

const obstacles = new ValueStore<ReadonlyMap<string, Obstacle>>(new Map());

function put(key: string, obstacle: Obstacle | null): void {
  obstacles.update((current) => {
    const next = new Map(current);
    if (obstacle === null) {
      next.delete(key);
    } else {
      next.set(key, obstacle);
    }
    return next;
  });
}

export function useMeasuredFrame(onFrame: (frame: Frame | null) => void): MeasuredView {
  const [node, setNode] = useState<View | null>(null);
  const [layouts, setLayouts] = useState(0);
  useEffect(() => {
    let live = true;
    node?.measureInWindow((x, y, width, height) => {
      if (live) {
        onFrame({ x, y, width, height });
      }
    });
    return (): void => {
      live = false;
    };
  }, [node, layouts, onFrame]);
  useEffect(
    () => (): void => {
      onFrame(null);
    },
    [onFrame],
  );
  return {
    attach: setNode,
    onLayout: (): void => {
      setLayouts((count) => count + 1);
    },
  };
}

export function useToastObstacle(edge: ObstacleEdge, active = true): MeasuredView {
  const key = useId();
  const onFrame = useCallback(
    (frame: Frame | null) => {
      const shown = frame !== null && frame.width > 0 && frame.height > 0;
      put(key, shown && active ? { edge, frame } : null);
    },
    [key, edge, active],
  );
  return useMeasuredFrame(onFrame);
}

export function useKeyboardObstacle(): void {
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', ({ endCoordinates }) => {
      const { screenX, screenY, width, height } = endCoordinates;
      put('keyboard', { edge: 'bottom', frame: { x: screenX, y: screenY, width, height } });
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      put('keyboard', null);
    });
    return (): void => {
      shown.remove();
      hidden.remove();
      put('keyboard', null);
    };
  }, []);
}

function roomOf(host: Frame, list: readonly Obstacle[]): ToastRoom {
  const tops = list.filter((entry) => entry.edge === 'bottom').map((entry) => entry.frame.y);
  const ends = list
    .filter((entry) => entry.edge === 'start')
    .map((entry) => entry.frame.x + entry.frame.width);
  return {
    bottom: tops.length === 0 ? null : Math.max(0, host.y + host.height - Math.min(...tops)),
    start: ends.length === 0 ? null : Math.max(0, Math.max(...ends) - host.x),
  };
}

export function useToastRoom(host: Frame | null): ToastRoom {
  const current = useValue(obstacles);
  if (host === null) {
    return { bottom: null, start: null };
  }
  return roomOf(host, [...current.values()]);
}
