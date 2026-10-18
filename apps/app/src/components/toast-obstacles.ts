import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { Keyboard, type View } from 'react-native';
import { ValueStore, useSelected } from '../design/external-store';

const LAYOUT_SETTLE_MS = 80;

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
    const held = current.get(key) ?? null;
    if (
      obstacle === null
        ? held === null
        : held?.edge === obstacle.edge && sameFrame(held.frame, obstacle.frame)
    ) {
      return current;
    }
    const next = new Map(current);
    if (obstacle === null) {
      next.delete(key);
    } else {
      next.set(key, obstacle);
    }
    return next;
  });
}

function sameFrame(left: Frame | null, right: Frame): boolean {
  return (
    left !== null &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

export function useMeasuredFrame(onFrame: (frame: Frame | null) => void): MeasuredView {
  const node = useRef<View | null>(null);
  const reported = useRef<Frame | null>(null);
  const live = useRef(false);
  const handler = useRef(onFrame);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const measure = useCallback((): void => {
    node.current?.measureInWindow((x, y, width, height) => {
      const next = { x, y, width, height };
      if (live.current && !sameFrame(reported.current, next)) {
        reported.current = next;
        handler.current(next);
      }
    });
  }, []);
  const settled = useCallback((): void => {
    if (settle.current !== null) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      settle.current = null;
      measure();
    }, LAYOUT_SETTLE_MS);
  }, [measure]);
  useEffect(() => {
    handler.current = onFrame;
    live.current = true;
    reported.current = null;
    measure();
    return (): void => {
      live.current = false;
      if (settle.current !== null) clearTimeout(settle.current);
      settle.current = null;
      onFrame(null);
    };
  }, [onFrame, measure]);
  const attach = useCallback(
    (view: View | null): void => {
      node.current = view;
      if (view !== null) {
        measure();
      }
    },
    [measure],
  );
  return useMemo(() => ({ attach, onLayout: settled }), [attach, settled]);
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
  const bottom = useSelected(obstacles, (current) =>
    host === null ? null : roomOf(host, [...current.values()]).bottom,
  );
  const start = useSelected(obstacles, (current) =>
    host === null ? null : roomOf(host, [...current.values()]).start,
  );
  return { bottom, start };
}
