import type { ReactNode } from 'react';
import type {
  ChatLink,
  ChatWidget,
  HealthMetric,
  HealthWidgetRange,
} from '@smarteverything/domain';
import type { BoardWidget, WidgetDefinition } from '../../../components/widget-board';
import { CAMERA_WIDGETS } from '../../cameras';
import { DayScope, FITNESS_WIDGETS, TodayScope, dailySeriesKeyOf } from '../../fitness';
import { HOME_WIDGETS, SPOTLIGHT_WIDGET } from '../../home';
import { nutritionWidgets, useTodayKey, type DaySource } from '../../nutrition';
import { BOARD_CATALOGUE, definitionIn, isFitnessBoard } from './board-sources';
import { WidgetUnavailableError } from './unavailable';

export interface ResolvedWidget {
  readonly key: string;
  readonly definition: WidgetDefinition;
  readonly options: BoardWidget['options'];
  readonly wide: boolean;
  readonly compact: boolean;
  readonly scope: ((children: ReactNode) => ReactNode) | null;
}

export type BoardChatWidget = Exclude<ChatWidget, ChatLink>;

function scopeOf(day: string | undefined): (children: ReactNode) => ReactNode {
  return day === undefined
    ? (children): ReactNode => <TodayScope>{children}</TodayScope>
    : (children): ReactNode => <DayScope day={day}>{children}</DayScope>;
}

function daySource(day: string | undefined): DaySource {
  return day === undefined
    ? useTodayKey
    : function useFixedDay(): ReturnType<DaySource> {
        return { day, today: useTodayKey().today };
      };
}

const RANGE_OPTIONS: Readonly<Record<HealthWidgetRange, { type: string; range: string | null }>> = {
  today: { type: 'metric', range: null },
  week: { type: 'trend', range: 'week' },
  month: { type: 'trend', range: 'month' },
};

function healthWidget(
  key: string,
  metric: HealthMetric,
  range: HealthWidgetRange,
  day: string | undefined,
): ResolvedWidget {
  const series = dailySeriesKeyOf(metric);
  if (series === null) {
    throw new WidgetUnavailableError('this health data', 'That measurement has no daily chart.');
  }
  const chosen = RANGE_OPTIONS[range];
  return {
    key,
    definition: definitionIn(FITNESS_WIDGETS, chosen.type),
    options: chosen.range === null ? { metric: series } : { metric: series, range: chosen.range },
    wide: chosen.range !== null,
    compact: false,
    scope: scopeOf(day),
  };
}

function plain(
  key: string,
  definition: WidgetDefinition,
  options: BoardWidget['options'],
): ResolvedWidget {
  return { key, definition, options, wide: false, compact: false, scope: null };
}

function boardWidget(
  key: string,
  type: string,
  options: Readonly<Record<string, string>> | undefined,
): ResolvedWidget {
  return {
    ...plain(key, definitionIn(BOARD_CATALOGUE, type), options),
    wide: true,
    scope: isFitnessBoard(type) ? scopeOf(undefined) : null,
  };
}

export function resolveWidget(
  key: string,
  widget: BoardChatWidget,
  remoteDevice: (remoteId: string) => string | null,
): ResolvedWidget {
  switch (widget.kind) {
    case 'device':
      return { ...plain(key, SPOTLIGHT_WIDGET, { deviceId: widget.id }), compact: true };
    case 'remote': {
      const deviceId = remoteDevice(widget.id);
      if (deviceId === null) {
        throw new WidgetUnavailableError('this remote', 'It was removed or its blaster is gone.');
      }
      return { ...plain(key, SPOTLIGHT_WIDGET, { deviceId }), compact: true };
    }
    case 'camera':
      return {
        ...plain(key, definitionIn(CAMERA_WIDGETS, 'camera'), { deviceId: widget.id }),
        wide: true,
      };
    case 'health':
      return healthWidget(key, widget.metric, widget.range, widget.day);
    case 'nutrition':
      return plain(
        key,
        definitionIn(nutritionWidgets(daySource(widget.day)), widget.part),
        undefined,
      );
    case 'board':
      return boardWidget(key, widget.type, widget.options);
    case 'weather':
      return { ...plain(key, definitionIn(HOME_WIDGETS, 'weather'), undefined), wide: true };
    case 'scenes':
      return { ...plain(key, definitionIn(HOME_WIDGETS, 'scenes'), undefined), wide: true };
  }
}
