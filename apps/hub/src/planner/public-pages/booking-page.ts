import type { PlannerBookingPageView } from '@smarteverything/domain';
import { escapeHtml } from '../../server/page-style';
import { BOOKING_SCRIPT } from './booking-script';
import { publicPageHtml } from './shell';

const STYLE = `
.days { display: flex; gap: 8px; overflow-x: auto; padding: 2px 2px 6px; margin: 0 -2px;
  scroll-snap-type: x proximity; }
button.day { flex: 0 0 72px; display: grid; justify-items: center; gap: 0; padding: 8px 4px;
  min-height: 92px; background: var(--surface-2); color: var(--text);
  border: 1px solid var(--outline-variant); scroll-snap-align: start; font-weight: 500; }
button.day .wd, button.day .mo { font-size: 12px; color: var(--muted); }
button.day .dn { font-size: 22px; font-weight: 600; line-height: 1.2; }
button.day .count { font-size: 11px; margin-top: 4px; border-radius: 999px; padding: 0 8px;
  background: var(--primary-container); color: var(--on-primary-container); }
button.day[aria-pressed='true'] { background: var(--primary); color: var(--on-primary);
  border-color: var(--primary); }
button.day[aria-pressed='true'] .wd, button.day[aria-pressed='true'] .mo { color: inherit; }
button.day[aria-pressed='true'] .count { background: rgb(0 0 0 / 14%); color: inherit; }
.times { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 8px; }
button.time { background: var(--surface-2); color: var(--text);
  border: 1px solid var(--outline); font-variant-numeric: tabular-nums; white-space: nowrap; }
button.time[aria-pressed='true'] { background: var(--primary); color: var(--on-primary);
  border-color: var(--primary); }
.when { font-weight: 600; }
.skeleton { height: 92px; border-radius: 12px; background: linear-gradient(90deg,
  var(--surface-2), var(--surface-3), var(--surface-2)); }
.done-mark { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center;
  background: var(--positive-container); color: var(--positive); font-size: 24px; font-weight: 700; }
a { color: var(--primary); font-weight: 600; }
`;

function headerOf(view: PlannerBookingPageView): string {
  const facts = [
    `<li><strong>${String(view.minutes)} min</strong></li>`,
    ...(view.location === null ? [] : [`<li>${escapeHtml(view.location)}</li>`]),
    '<li>Times in <span id="zone"></span></li>',
  ].join('');
  const about =
    view.description.trim() === '' ? '' : `<p class="muted">${escapeHtml(view.description)}</p>`;
  return `<section class="card"><p class="muted">Book a time with ${escapeHtml(view.host)}</p>
<h1>${escapeHtml(view.title)}</h1>${about}<ul class="facts">${facts}</ul></section>`;
}

const CHOOSE = `<section class="card" id="choose"><h2>Pick a day</h2>
<div id="loading" class="skeleton" aria-label="Loading open times"></div>
<div id="days" class="days" role="group" aria-label="Days with open times"></div>
<p id="status" class="notice" role="status" hidden></p>
<div id="pick" hidden><h2 id="day-title"></h2>
<div id="times" class="times" role="group" aria-label="Open times" style="margin-top: 12px"></div></div>
</section>`;

const DETAILS = `<form id="details" class="card" hidden><h2>Your details</h2>
<p id="when" class="when"></p>
<div><label for="name">Your name</label><input id="name" name="name" autocomplete="name" required></div>
<div><label for="email">Your email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
<div><label for="note">Anything to share before the meeting? (optional)</label><textarea id="note" name="note" rows="3"></textarea></div>
<button id="book" type="submit">Book this time</button>
<p class="muted small">You get a confirmation with a link to cancel. The organiser sees your name, email and note.</p>
</form>`;

const DONE = `<section id="done" class="card" tabindex="-1" hidden><div class="done-mark" aria-hidden="true">✓</div>
<h1>You are booked</h1><p id="done-when" class="when"></p><p id="done-where" class="muted"></p>
<p class="muted">Keep the cancel link below in case plans change. A confirmation email follows when the organiser's hub sends email.</p>
<p><a id="cancel" href="#">Cancel this booking</a></p></section>`;

export function bookingPageHtml(view: PlannerBookingPageView, nonce: string): string {
  const body = `<div id="booking" data-days="${String(view.ahead_days)}" style="display: contents">
${headerOf(view)}${CHOOSE}${DETAILS}${DONE}</div>`;
  return publicPageHtml({ title: view.title, body, style: STYLE, script: BOOKING_SCRIPT, nonce });
}
