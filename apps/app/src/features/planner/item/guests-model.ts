import {
  PLANNER_GUEST_ENTRY,
  type PlannerGuestEntry,
  type PlannerGuestResponse,
  type PlannerGuestRow,
  type PlannerGuestSuggestion,
  type PlannerRsvpAnswer,
  type ProfileRow,
} from '@smarteverything/domain';
import { compareText, plural } from '../../../format/text';
import { clock, dayLabel } from '../../../format/time';
import type { Invitation } from '../data/guests';

export function guestKeyOf(guest: PlannerGuestEntry | PlannerGuestRow): string {
  if (guest.kind === 'person') return `person:${guest.profile_id ?? ''}`;
  return `email:${(guest.email ?? '').toLowerCase()}`;
}

export function entryOf(row: PlannerGuestRow): PlannerGuestEntry {
  if (row.kind === 'person') return { kind: 'person', profile_id: row.profile_id ?? '' };
  return { kind: 'email', email: row.email ?? '', name: row.name };
}

export function entriesOf(rows: readonly PlannerGuestRow[]): readonly PlannerGuestEntry[] {
  return rows.map(entryOf);
}

export function withoutGuest(
  entries: readonly PlannerGuestEntry[],
  key: string,
): readonly PlannerGuestEntry[] {
  return entries.filter((entry) => guestKeyOf(entry) !== key);
}

export function withGuest(
  entries: readonly PlannerGuestEntry[],
  entry: PlannerGuestEntry,
): readonly PlannerGuestEntry[] {
  const key = guestKeyOf(entry);
  return entries.some((other) => guestKeyOf(other) === key) ? entries : [...entries, entry];
}

export function toggledPerson(
  entries: readonly PlannerGuestEntry[],
  profileId: string,
): readonly PlannerGuestEntry[] {
  const key = `person:${profileId}`;
  return entries.some((entry) => guestKeyOf(entry) === key)
    ? withoutGuest(entries, key)
    : [...entries, { kind: 'person', profile_id: profileId }];
}

const NAMED = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/u;

export function emailEntryOf(text: string): PlannerGuestEntry | null {
  const named = NAMED.exec(text);
  const name = named?.[1]?.trim() ?? '';
  const email = (named?.[2] ?? text).trim();
  const parsed = PLANNER_GUEST_ENTRY.safeParse({
    kind: 'email',
    email,
    name: name === '' ? null : name,
  });
  return parsed.success ? parsed.data : null;
}

export function shownSuggestionsOf(
  suggestions: readonly PlannerGuestSuggestion[],
  entries: readonly PlannerGuestEntry[],
): readonly PlannerGuestSuggestion[] {
  const added = new Set(entries.map(guestKeyOf));
  return suggestions.filter((one) => !added.has(`email:${one.email.toLowerCase()}`));
}

export interface ResponseCounts {
  readonly yes: number;
  readonly maybe: number;
  readonly no: number;
  readonly waiting: number;
}

export function responseCountsOf(rows: readonly PlannerGuestRow[]): ResponseCounts {
  const count = (response: PlannerGuestResponse): number =>
    rows.filter((row) => row.response === response).length;
  return {
    yes: count('yes'),
    maybe: count('maybe'),
    no: count('no'),
    waiting: count('needs_action'),
  };
}

export function countsTextOf(counts: ResponseCounts): string | null {
  const parts = [
    counts.yes === 0 ? null : `${String(counts.yes)} yes`,
    counts.maybe === 0 ? null : `${String(counts.maybe)} maybe`,
    counts.no === 0 ? null : `${String(counts.no)} no`,
    counts.waiting === 0 ? null : `${String(counts.waiting)} waiting`,
  ].filter((part) => part !== null);
  return parts.length === 0 ? null : parts.join(' · ');
}

export const ANSWER_ORDER: readonly PlannerRsvpAnswer[] = ['yes', 'maybe', 'no'];

export const RESPONSE_TEXT: Readonly<Record<PlannerGuestResponse, string>> = {
  needs_action: 'Waiting',
  yes: 'Going',
  maybe: 'Maybe',
  no: 'Not going',
};

export type DeliveryTone = 'variant' | 'critical';

export interface DeliveryLine {
  readonly text: string;
  readonly tone: DeliveryTone;
}

export function deliveryOf(row: PlannerGuestRow): DeliveryLine | null {
  if (row.kind === 'person') return null;
  switch (row.delivery) {
    case 'sent':
      return { text: 'Emailed', tone: 'variant' };
    case 'failed':
      return {
        text: `Not delivered: ${row.delivery_detail ?? 'the mail server refused it'}`,
        tone: 'critical',
      };
    case 'link_only':
      return { text: 'Not emailed · invite by link', tone: 'variant' };
    case 'google':
      return { text: 'Invited by Google', tone: 'variant' };
    case 'not_sent':
      return { text: 'Sending…', tone: 'variant' };
  }
}

export function canResend(row: PlannerGuestRow): boolean {
  return row.kind === 'email' && (row.delivery === 'failed' || row.delivery === 'sent');
}

export interface GuestView {
  readonly key: string;
  readonly row: PlannerGuestRow;
  readonly name: string;
  readonly detail: string | null;
  readonly profile: ProfileRow | null;
}

function nameOf(row: PlannerGuestRow, profile: ProfileRow | null): string {
  if (row.kind === 'person') return profile?.name ?? 'Someone in the home';
  return row.name ?? row.email ?? 'Guest';
}

const RESPONSE_ORDER: Readonly<Record<PlannerGuestResponse, number>> = {
  yes: 0,
  maybe: 1,
  needs_action: 2,
  no: 3,
};

export function guestViewsOf(
  rows: readonly PlannerGuestRow[],
  profiles: readonly ProfileRow[],
): readonly GuestView[] {
  return rows
    .map((row) => {
      const profile = profiles.find((one) => one.id === row.profile_id) ?? null;
      const name = nameOf(row, profile);
      return {
        key: guestKeyOf(row),
        row,
        name,
        detail: row.kind === 'email' && row.email !== name ? row.email : null,
        profile,
      };
    })
    .sort(
      (left, right) =>
        RESPONSE_ORDER[left.row.response] - RESPONSE_ORDER[right.row.response] ||
        compareText(left.name, right.name),
    );
}

export function inviteeChoicesOf(
  profiles: readonly ProfileRow[],
  organiser: string,
): readonly ProfileRow[] {
  return profiles
    .filter((profile) => profile.id !== organiser)
    .sort((left, right) => left.position - right.position);
}

function startOf(invitation: Invitation): number {
  return invitation.item.start === null
    ? Number.POSITIVE_INFINITY
    : Date.parse(invitation.item.start);
}

function stillAhead(item: Invitation['item'], now: number): boolean {
  if (item.series_end !== null) return Date.parse(item.series_end) > now;
  if (item.rrule !== null) return true;
  const last = item.end ?? item.start;
  return last === null || Date.parse(last) > now;
}

export function openInvitationsOf(
  invitations: readonly Invitation[],
  now: number,
): readonly Invitation[] {
  return invitations
    .filter(
      (invitation) =>
        invitation.guest.response === 'needs_action' && stillAhead(invitation.item, now),
    )
    .sort((left, right) => startOf(left) - startOf(right));
}

export function invitationsTitleOf(count: number): string {
  return plural(count, 'invitation', 'invitations');
}

export function invitationWhenOf(item: Invitation['item'], now: number, timeZone: string): string {
  if (item.start === null) return 'No time set';
  const day = dayLabel(item.start, now, item.all_day ? null : timeZone);
  if (item.all_day) return `${day} · All day`;
  return `${day} · ${clock(item.start, timeZone)}`;
}
