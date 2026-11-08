import type { PlannerStats } from '@smarteverything/domain';
import type { ChartPoint, DonutSlice } from '../../../components/charts';
import type { MetricItem } from '../../../components/metric-strip';
import { percent } from '../../../format/number';
import { hourWindowOf, hoursOf, peakHourOf, rangeLabelOf, shareOf } from './insights-model';

const NONE = '–';

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

function shareText(share: number | null): string {
  return share === null ? NONE : percent(share);
}

function doneItem(stats: PlannerStats, series: readonly ChartPoint[]): MetricItem {
  const { done, due } = stats.completion;
  return {
    key: 'done',
    label: 'Done',
    value: String(done),
    caption: `of ${String(due)} due`,
    series,
  };
}

function onTimeItem(stats: PlannerStats): MetricItem {
  const { on_time: onTime, late } = stats.on_time;
  const share = shareOf(onTime, onTime + late);
  return {
    key: 'on-time',
    label: 'On time',
    value: shareText(share),
    stale: share === null,
    caption: late === 0 ? 'nothing late' : `${String(late)} late`,
  };
}

function streakItem(stats: PlannerStats): MetricItem {
  const { current, longest } = stats.streaks;
  return {
    key: 'streak',
    label: 'Longest streak',
    value: String(longest),
    unit: longest === 1 ? 'day' : 'days',
    caption: current === 0 ? 'no streak now' : `${plural(current, 'day', 'days')} now`,
  };
}

function devicesItem(stats: PlannerStats): MetricItem {
  const { by_device: byDevice, by_hand: byHand } = stats.device_share;
  const share = shareOf(byDevice, byDevice + byHand);
  return {
    key: 'devices',
    label: 'Done by devices',
    value: shareText(share),
    stale: share === null,
    caption: `${String(byDevice)} checked by a device`,
  };
}

function missedItem(stats: PlannerStats): MetricItem {
  const missed = stats.completion.due - stats.completion.done;
  return {
    key: 'missed',
    label: 'Missed',
    value: String(missed),
    ...(missed === 0 ? {} : { tone: 'critical' as const }),
    caption: missed === 0 ? 'nothing missed' : `of ${String(stats.completion.due)} due`,
  };
}

export function kpisOf(stats: PlannerStats, series: readonly ChartPoint[]): readonly MetricItem[] {
  return [
    doneItem(stats, series),
    onTimeItem(stats),
    streakItem(stats),
    devicesItem(stats),
    missedItem(stats),
  ];
}

function doneSentence(stats: PlannerStats): string {
  const { done, due } = stats.completion;
  const { on_time: onTime, late } = stats.on_time;
  const share = shareOf(onTime, onTime + late);
  const timing = share === null ? '' : `, on time ${percent(share)}`;
  return `${String(done)} of ${String(due)} done${timing}.`;
}

function hourSentence(stats: PlannerStats): string | null {
  const peak = peakHourOf(stats);
  return peak === null ? null : `Most done from ${hourWindowOf(peak)}.`;
}

function calendarSentence(slices: readonly DonutSlice[]): string | null {
  const [top] = slices;
  return top === undefined ? null : `${top.label} took the most time, ${hoursOf(top.value)}.`;
}

export function changeFactsOf(stats: PlannerStats, slices: readonly DonutSlice[]): string {
  return [doneSentence(stats), hourSentence(stats), calendarSentence(slices)]
    .filter((sentence): sentence is string => sentence !== null)
    .join(' ');
}

export function changeTitleOf(stats: PlannerStats): string {
  return `What changed this ${stats.range}`;
}

export function changePromptOf(stats: PlannerStats): string {
  return `Compare my planner for this ${stats.range} (${rangeLabelOf(stats)}) with the ${stats.range} before: what changed in what I finished, when I finished it, what ran late and which habits slipped? Suggest one change and don't add anything until I accept.`;
}
