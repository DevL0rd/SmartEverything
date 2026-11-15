import type { PlannerItemRow } from '@smarteverything/domain';
import { escapeHtml } from '../../server/page-style';

export type InviteKind = 'invite' | 'update' | 'cancel' | 'booking_confirmation';

export interface InviteContent {
  readonly kind: InviteKind;
  readonly item: PlannerItemRow;
  readonly organiser: string;
  readonly guestName: string | null;
  readonly links: InviteLinks;
}

export interface InviteLinks {
  readonly yes: string;
  readonly maybe: string;
  readonly no: string;
}

export interface InviteText {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

const DAY = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function dayOf(local: string): string {
  return DAY.format(new Date(`${local.slice(0, 10)}T00:00:00Z`));
}

export function whenOf(
  item: Pick<PlannerItemRow, 'start_local' | 'end_local' | 'all_day' | 'time_zone'>,
): string {
  const start = item.start_local;
  if (start === null) return '';
  if (item.all_day) {
    const last = item.end_local;
    return last === null || last === start ? dayOf(start) : `${dayOf(start)} to ${dayOf(last)}`;
  }
  const from = start.slice(11, 16);
  const end = item.end_local;
  const sameDay = end !== null && end.slice(0, 10) === start.slice(0, 10);
  const until =
    end === null
      ? ''
      : sameDay
        ? ` to ${end.slice(11, 16)}`
        : ` to ${dayOf(end)} ${end.slice(11, 16)}`;
  const zone = item.time_zone === null ? '' : ` (${item.time_zone})`;
  return `${dayOf(start)}, ${from}${until}${zone}`;
}

function subjectOf(kind: InviteKind, item: PlannerItemRow): string {
  const when = whenOf(item);
  const tail = when === '' ? '' : ` @ ${when}`;
  if (kind === 'invite') return `Invitation: ${item.title}${tail}`;
  if (kind === 'update') return `Updated invitation: ${item.title}${tail}`;
  if (kind === 'cancel') return `Cancelled: ${item.title}${tail}`;
  return `Confirmed: ${item.title}${tail}`;
}

function leadOf(content: InviteContent): string {
  const { kind, organiser } = content;
  if (kind === 'invite') return `${organiser} invited you to an event.`;
  if (kind === 'update') return `${organiser} changed this event.`;
  if (kind === 'cancel') return `${organiser} cancelled this event.`;
  return `Your booking with ${organiser} is confirmed.`;
}

function detailLines(item: PlannerItemRow): string[] {
  const lines = [item.title];
  const when = whenOf(item);
  if (when !== '') lines.push(`When: ${when}`);
  if (item.location !== null) lines.push(`Where: ${item.location}`);
  if (item.notes !== '') lines.push('', item.notes);
  return lines;
}

function answerLines(content: InviteContent): string[] {
  const { kind, links } = content;
  if (kind === 'cancel') return [];
  if (kind === 'booking_confirmation') {
    return ['', `Cancel the booking: ${links.no}`, 'Replies to this email are not read.'];
  }
  return [
    '',
    `Yes: ${links.yes}`,
    `Maybe: ${links.maybe}`,
    `No: ${links.no}`,
    '',
    'Replies to this email are not read; use the links above to answer.',
  ];
}

function htmlAnswers(content: InviteContent): string {
  const { kind, links } = content;
  if (kind === 'cancel') return '';
  const link = (href: string, label: string): string =>
    `<a href="${escapeHtml(href)}">${label}</a>`;
  if (kind === 'booking_confirmation') {
    return `<p>${link(links.no, 'Cancel the booking')}</p><p><small>Replies to this email are not read.</small></p>`;
  }
  return `<p>${link(links.yes, 'Yes')} · ${link(links.maybe, 'Maybe')} · ${link(links.no, 'No')}</p><p><small>Replies to this email are not read; use the links above to answer.</small></p>`;
}

function htmlDetails(item: PlannerItemRow): string {
  const when = whenOf(item);
  return [
    `<h2>${escapeHtml(item.title)}</h2>`,
    when === '' ? '' : `<p><strong>When:</strong> ${escapeHtml(when)}</p>`,
    item.location === null ? '' : `<p><strong>Where:</strong> ${escapeHtml(item.location)}</p>`,
    item.notes === '' ? '' : `<p>${escapeHtml(item.notes).replaceAll('\n', '<br>')}</p>`,
  ].join('');
}

export function inviteText(content: InviteContent): InviteText {
  const greeting = content.guestName === null ? 'Hello,' : `Hello ${content.guestName},`;
  const lead = leadOf(content);
  return {
    subject: subjectOf(content.kind, content.item),
    text: [greeting, '', lead, '', ...detailLines(content.item), ...answerLines(content)].join(
      '\n',
    ),
    html: `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(lead)}</p>${htmlDetails(content.item)}${htmlAnswers(content)}`,
  };
}
