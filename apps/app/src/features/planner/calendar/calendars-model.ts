import type {
  PlannerCollectionRow,
  PlannerCollectionShareRow,
  PlannerGuestResponse,
  PlannerShareRole,
} from '@smarteverything/domain';
import { compareText } from '../../../format/text';

export const CALENDAR_SECTIONS = [
  { key: 'mine', title: 'My calendars', icon: 'calendar' },
  { key: 'family', title: 'Family', icon: 'house' },
  { key: 'shared', title: 'Shared with me', icon: 'users' },
  { key: 'subscriptions', title: 'Subscriptions', icon: 'globe' },
  { key: 'holidays', title: 'Holidays', icon: 'sun' },
  { key: 'birthdays', title: 'Birthdays', icon: 'party' },
] as const;

export type CalendarSectionKey = (typeof CALENDAR_SECTIONS)[number]['key'];

export type CalendarRole = 'owner' | PlannerShareRole;

export interface Named {
  readonly id: string;
  readonly name: string;
}

export interface ViewerCalendar {
  readonly row: PlannerCollectionRow;
  readonly section: CalendarSectionKey;
  readonly role: CalendarRole;
  readonly share: PlannerCollectionShareRow | null;
  readonly ownerName: string | null;
  readonly sharedWith: readonly PlannerCollectionShareRow[];
}

export interface CalendarInput {
  readonly collections: readonly PlannerCollectionRow[];
  readonly shares: readonly PlannerCollectionShareRow[];
  readonly profiles: readonly Named[];
  readonly me: string | null;
}

export interface CalendarSection {
  readonly key: CalendarSectionKey;
  readonly title: string;
  readonly icon: (typeof CALENDAR_SECTIONS)[number]['icon'];
  readonly calendars: readonly ViewerCalendar[];
}

function roleOf(
  row: PlannerCollectionRow,
  share: PlannerCollectionShareRow | null,
  me: string,
): CalendarRole | null {
  if (row.profile_id === me) return 'owner';
  if (share !== null) return share.role;
  return row.audience === 'household' ? 'edit' : null;
}

export function sectionOf(row: PlannerCollectionRow, role: CalendarRole): CalendarSectionKey {
  if (row.feed !== null) {
    if (row.feed.kind === 'holidays') return 'holidays';
    return row.feed.kind === 'birthdays' ? 'birthdays' : 'subscriptions';
  }
  if (row.audience === 'household') return 'family';
  return role === 'owner' ? 'mine' : 'shared';
}

function viewerRow(
  row: PlannerCollectionRow,
  share: PlannerCollectionShareRow | null,
): PlannerCollectionRow {
  if (share === null) return row;
  return { ...row, colour: share.colour ?? row.colour, visible: share.visible };
}

function byPlace(left: ViewerCalendar, right: ViewerCalendar): number {
  return left.row.position - right.row.position || compareText(left.row.name, right.row.name);
}

export function viewerCalendarsOf(input: CalendarInput): readonly ViewerCalendar[] {
  const { me } = input;
  if (me === null) return [];
  const names = new Map(input.profiles.map((person) => [person.id, person.name] as const));
  return input.collections
    .filter((row) => row.kind === 'calendar')
    .flatMap((row): ViewerCalendar[] => {
      const share =
        input.shares.find((entry) => entry.collection_id === row.id && entry.profile_id === me) ??
        null;
      const role = roleOf(row, share, me);
      if (role === null) return [];
      return [
        {
          row: viewerRow(row, share),
          section: sectionOf(row, role),
          role,
          share,
          ownerName: role === 'owner' ? null : (names.get(row.profile_id) ?? null),
          sharedWith: input.shares.filter((entry) => entry.collection_id === row.id),
        },
      ];
    })
    .sort(byPlace);
}

export function sectionsOf(calendars: readonly ViewerCalendar[]): readonly CalendarSection[] {
  return CALENDAR_SECTIONS.map((section) => ({
    key: section.key,
    title: section.title,
    icon: section.icon,
    calendars: calendars.filter((calendar) => calendar.section === section.key),
  }));
}

export function shownCalendarsOf(
  calendars: readonly Pick<PlannerCollectionRow, 'id' | 'visible'>[],
): readonly string[] | null {
  return calendars.every((row) => row.visible)
    ? null
    : calendars.filter((row) => row.visible).map((row) => row.id);
}

export function canEditItems(calendar: ViewerCalendar): boolean {
  if (calendar.role === 'view') return false;
  return calendar.row.feed === null || calendar.row.feed.kind === 'birthdays';
}

export function canManage(calendar: ViewerCalendar): boolean {
  return calendar.role === 'owner';
}

export function canShare(calendar: ViewerCalendar): boolean {
  return canManage(calendar) && calendar.row.audience === 'personal';
}

export function canImport(calendar: ViewerCalendar): boolean {
  return calendar.row.feed === null && calendar.role !== 'view';
}

export function sourceText(calendar: ViewerCalendar): string {
  const { row } = calendar;
  if (calendar.ownerName !== null) {
    if (row.audience === 'household') return `Everyone at home · made by ${calendar.ownerName}`;
    const role = calendar.role === 'view' ? 'view only' : 'can edit';
    return `Shared by ${calendar.ownerName} · ${role}`;
  }
  if (row.source === 'google') return 'Google';
  if (row.audience === 'household') return 'Everyone at home';
  const people = calendar.sharedWith.length;
  if (people === 0) return 'This hub';
  return people === 1 ? 'Shared with 1 person' : `Shared with ${String(people)} people`;
}

export type EventLook =
  'plain' | 'invited' | 'maybe' | 'declined' | 'feed' | 'holiday' | 'birthday';

function calendarLookOf(row: PlannerCollectionRow | undefined): EventLook {
  const feed = row?.feed ?? null;
  if (feed === null) return 'plain';
  if (feed.kind === 'holidays') return 'holiday';
  return feed.kind === 'birthdays' ? 'birthday' : 'feed';
}

export function eventLookOf(
  row: PlannerCollectionRow | undefined,
  response: PlannerGuestResponse | null,
): EventLook {
  if (response === 'needs_action') return 'invited';
  if (response === 'maybe') return 'maybe';
  if (response === 'no') return 'declined';
  return calendarLookOf(row);
}

export const LOOK_WORDS: Readonly<Record<EventLook, string | null>> = {
  plain: null,
  invited: 'invited, not answered',
  maybe: 'you said maybe',
  declined: 'you declined',
  feed: 'from a subscription',
  holiday: 'public holiday',
  birthday: 'birthday',
};

export interface ShareCandidate<P extends Named> {
  readonly person: P;
  readonly share: PlannerCollectionShareRow | null;
}

export function shareCandidatesOf<P extends Named>(
  calendar: ViewerCalendar,
  people: readonly P[],
): readonly ShareCandidate<P>[] {
  return people
    .filter((person) => person.id !== calendar.row.profile_id)
    .map((person) => ({
      person,
      share: calendar.sharedWith.find((entry) => entry.profile_id === person.id) ?? null,
    }));
}
