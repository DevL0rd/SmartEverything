import type { PlannerGuestResponse, PlannerImportResult } from '@smarteverything/domain';

export type IcalPart = PlannerImportResult['unsupported'][number]['part'];

export interface IcalTiming {
  readonly start: string;
  readonly end: string | null;
  readonly zone: string | null;
  readonly allDay: boolean;
}

export interface IcalGuest {
  readonly email: string;
  readonly name: string | null;
  readonly response: PlannerGuestResponse;
}

export interface IcalContent {
  readonly title: string;
  readonly notes: string;
  readonly location: string | null;
  readonly timing: IcalTiming | null;
}

export interface IcalOverride {
  readonly originalStart: string;
  readonly content: IcalContent | null;
  readonly sequence: number;
}

export interface IcalTaskFields {
  readonly dueDate: string | null;
  readonly dueAt: string | null;
  readonly priority: 1 | 2 | 3 | null;
  readonly done: boolean;
  readonly completedAt: string | null;
}

export interface IcalEntry extends IcalContent {
  readonly kind: 'event' | 'task';
  readonly uid: string;
  readonly sequence: number;
  readonly rrule: string | null;
  readonly exdates: readonly string[];
  readonly extraDates: readonly string[];
  readonly reminders: readonly number[];
  readonly guests: readonly IcalGuest[];
  readonly overrides: readonly IcalOverride[];
  readonly task: IcalTaskFields | null;
  readonly cancelled: boolean;
  readonly parentUid: string | null;
}

export interface IcalUnsupported {
  readonly part: IcalPart;
  readonly detail: string;
}

export interface IcalCalendar {
  readonly refreshMinutes: number | null;
  readonly entries: readonly IcalEntry[];
  readonly unsupported: readonly IcalUnsupported[];
}

export class IcalParseError extends Error {
  override readonly name = 'IcalParseError';

  constructor(
    readonly reason: string,
    options?: ErrorOptions,
  ) {
    super(`The file is not a readable iCalendar file: ${reason}`, options);
  }
}

export function unsupportedSummary(
  items: readonly IcalUnsupported[],
): PlannerImportResult['unsupported'] {
  const counts = new Map<string, { part: IcalPart; detail: string; count: number }>();
  for (const item of items) {
    const key = `${item.part}\u0000${item.detail}`;
    const seen = counts.get(key);
    if (seen === undefined) counts.set(key, { ...item, count: 1 });
    else seen.count += 1;
  }
  return [...counts.values()];
}
