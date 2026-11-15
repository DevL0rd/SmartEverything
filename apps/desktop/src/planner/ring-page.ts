import {
  plannerMathsProblemsOf,
  plannerMathsSeedOf,
  type PlannerMathsProblem,
} from '@smarteverything/domain';
import { choiceFailedLine, ringTime, ringTitle, KIND_NAMES } from './ring-copy.js';
import { RING_PAGE_SCRIPT } from './ring-page-script.js';
import { RING_PAGE_STYLE } from './ring-page-style.js';
import type { RingSoundSource } from './ring-sounds.js';
import { snoozesLeft, type DesktopRing, type RingChoice } from './ring-types.js';

export const RING_EVENT_TITLE_PREFIX = 'smarteverything-planner-ring:';

export type RingPageEvent = RingChoice | 'sound-failed';

type Stop =
  | { readonly kind: 'button'; readonly label: string }
  | { readonly kind: 'maths'; readonly problems: readonly PlannerMathsProblem[] }
  | { readonly kind: 'phone'; readonly task: string };

export interface RingPageView {
  readonly title: string;
  readonly kindName: string;
  readonly dueTime: string;
  readonly rampSeconds: number;
  readonly source: RingSoundSource;
  readonly snooze: { readonly left: number | null } | null;
  readonly stop: Stop;
  readonly failure: string | null;
}

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/gu, (character) => ESCAPES[character] ?? character);
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<\u2028\u2029]/gu,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

export function ringPageEventOf(title: string): RingPageEvent | null {
  if (!title.startsWith(RING_EVENT_TITLE_PREFIX)) return null;
  const event = title.slice(RING_EVENT_TITLE_PREFIX.length);
  return event === 'dismiss' || event === 'snooze' || event === 'sound-failed' ? event : null;
}

function stopOf(ring: DesktopRing, day: string): Stop {
  const { challenge } = ring;
  if (challenge.kind === 'maths') {
    return {
      kind: 'maths',
      problems: plannerMathsProblemsOf(
        plannerMathsSeedOf(ring.kind, ring.refId, day),
        challenge.difficulty,
        challenge.count,
      ),
    };
  }
  if (challenge.kind === 'qr') {
    return { kind: 'phone', task: 'Scan the alarm’s QR code with the SmartEverything app.' };
  }
  if (challenge.kind === 'steps') {
    return { kind: 'phone', task: `Walk ${String(challenge.steps)} steps with your phone.` };
  }
  return { kind: 'button', label: ring.kind === 'timer' ? 'Stop' : 'Dismiss' };
}

export function ringPageView(
  ring: DesktopRing,
  source: RingSoundSource,
  day: string,
  failed: RingChoice | null,
): RingPageView {
  return {
    title: ringTitle(ring),
    kindName: KIND_NAMES[ring.kind],
    dueTime: ringTime(ring),
    rampSeconds: ring.rampSeconds,
    source,
    snooze: ring.kind === 'alarm' ? { left: snoozesLeft(ring) } : null,
    stop: stopOf(ring, day),
    failure: failed === null ? null : choiceFailedLine(ring, failed),
  };
}

const ICONS = {
  alarm:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6M22 6l-3-3"/></svg>',
  moon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  phone:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>',
  brain:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
} as const;

function snoozeHtml(view: RingPageView): string {
  if (view.snooze === null) return '';
  const { left } = view.snooze;
  if (left === 0) return '<p class="caption">No snoozes left</p>';
  const count = left === null ? '' : ` · ${String(left)} left`;
  return `<button class="tonal" data-choice="snooze" type="button">${ICONS.moon}Snooze${count}</button>`;
}

function mathsHtml(problems: readonly PlannerMathsProblem[]): string {
  const bars = problems.map(() => '<i></i>').join('');
  const many = problems.length === 1 ? 'this problem' : `${String(problems.length)} problems`;
  return `<section class="card" aria-label="Maths challenge">
<h2>${ICONS.brain}Solve ${many} to stop the alarm</h2>
<div class="progress" aria-hidden="true">${bars}</div>
<p id="step"></p>
<div class="problem" id="problem" aria-live="polite"></div>
<form id="maths" autocomplete="off">
<input id="answer" inputmode="numeric" aria-label="Answer" autofocus>
<button class="primary" type="submit">Check</button>
</form>
<div class="wrong" id="wrong" aria-live="assertive"></div>
</section>`;
}

function stopHtml(stop: Stop): { readonly card: string; readonly button: string } {
  if (stop.kind === 'maths') return { card: mathsHtml(stop.problems), button: '' };
  if (stop.kind === 'phone') {
    return {
      card: `<section class="card"><h2>${ICONS.phone}Stop it on your phone</h2><p>${escapeHtml(stop.task)}</p></section>`,
      button: '',
    };
  }
  return {
    card: '',
    button: `<button class="primary" data-choice="dismiss" type="button" autofocus>${stop.label}</button>`,
  };
}

function failureHtml(failure: string | null): string {
  return failure === null ? '' : `<p class="failed" role="alert">${escapeHtml(failure)}</p>\n`;
}

function bodyHtml(view: RingPageView): string {
  const stop = stopHtml(view.stop);
  const kind = view.title === view.kindName ? view.kindName : `${view.kindName} · ${view.title}`;
  return `<div class="glow" aria-hidden="true"></div>
<main>
<header class="head">
<div class="kind">${ICONS.alarm}<span>${escapeHtml(kind)}</span></div>
<h1 class="time" role="timer"><span id="clock">${escapeHtml(view.dueTime)}</span><small id="period"></small></h1>
<div class="date" id="date"></div>
</header>
<div class="note" id="note" role="status"></div>
${failureHtml(view.failure)}${stop.card}
<div class="spacer"></div>
<div class="actions">${snoozeHtml(view)}${stop.button}</div>
</main>`;
}

export function ringPageHtml(view: RingPageView): string {
  const data = { ...view, prefix: RING_EVENT_TITLE_PREFIX, problems: problemsOf(view.stop) };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; media-src file: http: https:">
<title>${escapeHtml(view.title)}</title>
<style>${RING_PAGE_STYLE}</style>
</head>
<body>
${bodyHtml(view)}
<script type="application/json" id="ring-view">${scriptJson(data)}</script>
<script>${RING_PAGE_SCRIPT}</script>
</body>
</html>`;
}

function problemsOf(stop: Stop): readonly PlannerMathsProblem[] {
  return stop.kind === 'maths' ? stop.problems : [];
}
