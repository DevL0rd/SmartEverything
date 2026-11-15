import { useFrameBodyWidth } from '../../../components/page-shell/body-width';

export const CALENDAR_WIDE_FROM = 560;

export function calendarWideAt(bodyWidth: number): boolean {
  return bodyWidth >= CALENDAR_WIDE_FROM;
}

export function useCalendarWide(): boolean {
  return calendarWideAt(useFrameBodyWidth());
}
