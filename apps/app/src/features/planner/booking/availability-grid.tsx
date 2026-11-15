import type { PlannerBookingWindow } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View, type GestureResponderEvent } from 'react-native';
import { Text } from '../../../components/text';
import { selectionTick } from '../../../platform/haptics';
import { weekdayLetterOf, weekdayNameOf } from '../clock/alarm-text';
import {
  SLOT_MINUTES,
  cellKeyOf,
  cellsOf,
  minuteOfTime,
  paintedCells,
  windowsOf,
  type BookingCell,
  type BookingCells,
  type HourSpan,
} from './booking-model';

const ROW_PX = 12;

const LABEL_EVERY_MINUTES = 120;

interface Stroke {
  readonly from: BookingCell;
  readonly to: BookingCell;
  readonly on: boolean;
}

export interface AvailabilityGridProps {
  readonly windows: readonly PlannerBookingWindow[];
  readonly order: readonly number[];
  readonly span: HourSpan;
  readonly onChange: (windows: readonly PlannerBookingWindow[]) => void;
}

function heightOf(span: HourSpan): number {
  return ((span.to - span.from) / SLOT_MINUTES) * ROW_PX;
}

function yOf(minute: number, span: HourSpan): number {
  return ((minute - span.from) / SLOT_MINUTES) * ROW_PX;
}

function slotAt(event: GestureResponderEvent, span: HourSpan): number {
  const first = span.from / SLOT_MINUTES;
  const last = span.to / SLOT_MINUTES - 1;
  const slot = first + Math.floor(event.nativeEvent.locationY / ROW_PX);
  return Math.min(last, Math.max(first, slot));
}

function labelsOf(span: HourSpan): readonly number[] {
  const first = Math.ceil(span.from / LABEL_EVERY_MINUTES) * LABEL_EVERY_MINUTES;
  const count = Math.floor((span.to - first) / LABEL_EVERY_MINUTES) + 1;
  return Array.from(
    { length: Math.max(0, count) },
    (_, index) => first + index * LABEL_EVERY_MINUTES,
  );
}

function dayLabelOf(windows: readonly PlannerBookingWindow[], day: number): string {
  const open = windows.filter((window) => window.day === day);
  const text = open.map((window) => `${window.start} to ${window.end}`).join(', ');
  return `${weekdayNameOf(day)}: ${text === '' ? 'closed' : text}`;
}

function HourGutter({ span }: { readonly span: HourSpan }): ReactNode {
  const size = { height: heightOf(span) };
  return (
    <View className="w-7" style={size}>
      {labelsOf(span).map((minute) => {
        const place = { top: yOf(minute, span) - 7 };
        return (
          <View key={minute} className="absolute right-1" style={place}>
            <Text variant="caption" tone="faint" className="tabular">
              {String(minute / 60).padStart(2, '0')}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function HourLines({ span }: { readonly span: HourSpan }): ReactNode {
  return labelsOf(span).map((minute) => {
    const place = { top: yOf(minute, span) };
    return (
      <View
        key={minute}
        pointerEvents="none"
        className="absolute inset-x-0 h-px bg-outline-variant"
        style={place}
      />
    );
  });
}

function Blocks({
  windows,
  span,
}: {
  readonly windows: readonly PlannerBookingWindow[];
  readonly span: HourSpan;
}): ReactNode {
  return windows.map((window) => {
    const top = Math.floor(minuteOfTime(window.start) / SLOT_MINUTES) * SLOT_MINUTES;
    const bottom = Math.ceil(minuteOfTime(window.end) / SLOT_MINUTES) * SLOT_MINUTES;
    const place = { top: yOf(top, span), height: yOf(bottom, span) - yOf(top, span) };
    return (
      <View
        key={`${window.start}-${window.end}`}
        pointerEvents="none"
        className="absolute inset-x-0.5 rounded-xs border border-primary bg-primary/70"
        style={place}
      />
    );
  });
}

interface ColumnProps {
  readonly day: number;
  readonly windows: readonly PlannerBookingWindow[];
  readonly cells: BookingCells;
  readonly span: HourSpan;
  readonly onStroke: (stroke: Stroke | null, commit: boolean) => void;
}

function DayColumn({ day, windows, cells, span, onStroke }: ColumnProps): ReactNode {
  const [start, setStart] = useState<{ readonly cell: BookingCell; readonly on: boolean } | null>(
    null,
  );
  const size = { height: heightOf(span) };
  const move = (event: GestureResponderEvent, commit: boolean): void => {
    if (start === null) return;
    onStroke({ from: start.cell, to: { day, slot: slotAt(event, span) }, on: start.on }, commit);
    if (commit) setStart(null);
  };
  return (
    <View
      accessible
      accessibilityLabel={dayLabelOf(windows, day)}
      className="min-w-0 flex-1 overflow-hidden rounded-xs bg-surface-2"
      style={size}
      onStartShouldSetResponder={() => true}
      onResponderTerminationRequest={() => true}
      onResponderGrant={(event) => {
        const cell = { day, slot: slotAt(event, span) };
        const on = !cells.has(cellKeyOf(cell));
        selectionTick();
        setStart({ cell, on });
        onStroke({ from: cell, to: cell, on }, false);
      }}
      onResponderMove={(event) => {
        move(event, false);
      }}
      onResponderRelease={(event) => {
        move(event, true);
      }}
      onResponderTerminate={() => {
        setStart(null);
        onStroke(null, false);
      }}
    >
      <HourLines span={span} />
      <Blocks windows={windows.filter((window) => window.day === day)} span={span} />
    </View>
  );
}

export function AvailabilityGrid({
  windows,
  order,
  span,
  onChange,
}: AvailabilityGridProps): ReactNode {
  const [preview, setPreview] = useState<readonly PlannerBookingWindow[] | null>(null);
  const shown = preview ?? windows;
  const cells = cellsOf(windows);
  const onStroke = (stroke: Stroke | null, commit: boolean): void => {
    if (stroke === null) {
      setPreview(null);
      return;
    }
    const next = windowsOf(paintedCells(cells, stroke.from, stroke.to, stroke.on));
    if (!commit) {
      setPreview(next);
      return;
    }
    setPreview(null);
    onChange(next);
  };
  return (
    <View className="gap-1">
      <View className="flex-row gap-1 pl-8">
        {order.map((day) => (
          <Text key={day} variant="caption" tone="variant" align="center" className="flex-1">
            {weekdayLetterOf(day)}
          </Text>
        ))}
      </View>
      <View className="flex-row gap-1">
        <HourGutter span={span} />
        {order.map((day) => (
          <DayColumn
            key={day}
            day={day}
            windows={shown}
            cells={cells}
            span={span}
            onStroke={onStroke}
          />
        ))}
      </View>
    </View>
  );
}
