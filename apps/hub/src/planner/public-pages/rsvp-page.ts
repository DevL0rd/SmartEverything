import type { PlannerRsvpAnswer, PlannerRsvpPage } from '@smarteverything/domain';
import { escapeHtml } from '../../server/page-style';
import { whenOf } from '../invites/content';
import { publicPageHtml } from './shell';

export interface RsvpView {
  readonly token: string;
  readonly answer: PlannerRsvpAnswer | null;
}

const STATUS: Readonly<Record<PlannerRsvpPage['response'], string>> = {
  needs_action: 'Not answered yet',
  yes: 'You said yes',
  maybe: 'You said maybe',
  no: 'You said no',
};

const CHOICES: readonly (readonly [PlannerRsvpAnswer, string])[] = [
  ['yes', 'Yes'],
  ['maybe', 'Maybe'],
  ['no', 'No'],
];

function detailsOf(page: PlannerRsvpPage): string {
  const facts = [
    `<li><strong>${escapeHtml(whenOf(page))}</strong></li>`,
    ...(page.location === null ? [] : [`<li>${escapeHtml(page.location)}</li>`]),
  ].join('');
  const greeting =
    page.guest_name === null ? '' : `<p class="muted">Hi ${escapeHtml(page.guest_name)},</p>`;
  return `<section class="card">${greeting}<h1>${escapeHtml(page.title)}</h1>
<p class="muted">${page.booking ? 'Booked with' : 'Invitation from'} ${escapeHtml(page.organiser)}</p>
<ul class="facts">${facts}</ul></section>`;
}

function noteField(page: PlannerRsvpPage): string {
  return `<label for="note">Note to ${escapeHtml(page.organiser)} (optional)</label>
<textarea id="note" name="note" rows="2">${escapeHtml(page.note ?? '')}</textarea>`;
}

function choiceButton(
  value: PlannerRsvpAnswer,
  label: string,
  lead: PlannerRsvpAnswer | null,
): string {
  const pressed = lead === value;
  return `<button type="submit" name="response" value="${value}" aria-pressed="${String(pressed)}"${pressed ? '' : ' class="quiet"'}>${label}</button>`;
}

function leadOf(page: PlannerRsvpPage, view: RsvpView): PlannerRsvpAnswer | null {
  if (view.answer !== null) return view.answer;
  return page.response === 'needs_action' ? null : page.response;
}

function answerForm(page: PlannerRsvpPage, view: RsvpView): string {
  const action = `/rsvp/${encodeURIComponent(view.token)}`;
  if (page.booking) {
    return `<form class="card" method="post" action="${action}"><h2>Cancel</h2>
<p class="muted">Can no longer make it? Cancel and the time opens up again.</p>${noteField(page)}
<input type="hidden" name="response" value="no"><button type="submit" class="danger">Cancel the booking</button></form>`;
  }
  const lead = leadOf(page, view);
  const prompt = view.answer === null ? 'Will you come?' : 'Tap your answer once more to send it.';
  const buttons = CHOICES.map(([value, label]) => choiceButton(value, label, lead)).join('');
  return `<form class="card" method="post" action="${action}"><h2>Your answer</h2>
<p>${prompt}</p><div class="row">${buttons}</div>${noteField(page)}</form>`;
}

function statusOf(page: PlannerRsvpPage): string {
  if (page.booking && page.response === 'no') {
    return '<p class="notice bad">This booking is cancelled.</p>';
  }
  return `<p class="pill ${page.response}" role="status">${STATUS[page.response]}</p>`;
}

const FOOTER =
  '<footer>Replies to the invitation email are not read. Answer with the buttons on this page.</footer>';

export function rsvpPageHtml(page: PlannerRsvpPage, view: RsvpView): string {
  if (page.cancelled) {
    return publicPageHtml({
      title: page.title,
      body: `${detailsOf(page)}<p class="notice bad" role="status">This event was cancelled.</p>`,
    });
  }
  const closed = page.booking && page.response === 'no';
  return publicPageHtml({
    title: page.title,
    body: `${detailsOf(page)}${statusOf(page)}${closed ? '' : answerForm(page, view)}${FOOTER}`,
  });
}
