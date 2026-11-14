import { useReducer, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

const ROUNDING_PX = 0.5;

export type LogStage = 'off' | 'probe' | 'on';

export interface LogRoom {
  readonly stage: LogStage;
  readonly need: number | null;
  readonly got: number | null;
}

export type LogMeasure =
  | { readonly kind: 'need'; readonly px: number }
  | { readonly kind: 'got'; readonly px: number }
  | { readonly kind: 'slack'; readonly px: number };

export const LOG_ROOM_START: LogRoom = { stage: 'off', need: null, got: null };

const OFF: LogRoom = LOG_ROOM_START;

function holds(room: number | null, need: number | null): boolean {
  return room !== null && need !== null && room + ROUNDING_PX >= need;
}

function onAfter(room: LogRoom): LogRoom {
  return room.got === null || room.need === null || holds(room.got, room.need) ? room : OFF;
}

function afterSlack(room: LogRoom, px: number): LogRoom {
  if (room.stage !== 'off' || px <= ROUNDING_PX) {
    return room;
  }
  return { stage: 'probe', need: null, got: px };
}

function afterNeed(room: LogRoom, px: number): LogRoom {
  if (room.stage === 'probe') {
    return holds(room.got, px) ? { stage: 'on', need: px, got: null } : OFF;
  }
  return room.stage === 'on' && room.need !== px ? onAfter({ ...room, need: px }) : room;
}

function afterGot(room: LogRoom, px: number): LogRoom {
  return room.stage === 'on' && room.got !== px ? onAfter({ ...room, got: px }) : room;
}

export function logRoomAfter(room: LogRoom, measure: LogMeasure): LogRoom {
  if (measure.kind === 'slack') {
    return afterSlack(room, measure.px);
  }
  return measure.kind === 'need' ? afterNeed(room, measure.px) : afterGot(room, measure.px);
}

export interface LogFit {
  readonly stage: LogStage;
  readonly onSlack: (px: number) => void;
  readonly onNeed: (event: LayoutChangeEvent) => void;
  readonly onGot: (event: LayoutChangeEvent) => void;
}

export function useLogFit(): LogFit {
  const [room, measure] = useReducer(logRoomAfter, LOG_ROOM_START);
  return {
    stage: room.stage,
    onSlack: (px): void => {
      measure({ kind: 'slack', px });
    },
    onNeed: (event): void => {
      measure({ kind: 'need', px: event.nativeEvent.layout.height });
    },
    onGot: (event): void => {
      measure({ kind: 'got', px: event.nativeEvent.layout.height });
    },
  };
}

const PROBE = { height: 0 } as const;

export function LogSlot({
  log,
  fit,
}: {
  readonly log: ReactNode;
  readonly fit: LogFit;
}): ReactNode {
  if (fit.stage === 'off') {
    return null;
  }
  const probing = fit.stage === 'probe';
  return (
    <View
      className="min-h-0 shrink overflow-hidden"
      style={probing ? PROBE : undefined}
      aria-hidden={probing}
      onLayout={probing ? undefined : fit.onGot}
    >
      <View className="pt-1.5" onLayout={fit.onNeed}>
        {log}
      </View>
    </View>
  );
}
