import { ringTime, ringTitle } from './ring-copy.js';
import type { DesktopRing, RingChoice } from './ring-types.js';

export const RING_CHOICE_TITLE_PREFIX = 'smarteverything-planner-ring:';

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

export function choiceOfTitle(title: string): RingChoice | null {
  if (!title.startsWith(RING_CHOICE_TITLE_PREFIX)) return null;
  const choice = title.slice(RING_CHOICE_TITLE_PREFIX.length);
  return choice === 'dismiss' || choice === 'snooze' ? choice : null;
}

const STYLE = `
:root { color-scheme: light dark; --ink: #14161a; --paper: #f4f5f7; --quiet: #5b6068; --accent: #e5484d; }
@media (prefers-color-scheme: dark) { :root { --ink: #f4f5f7; --paper: #14161a; --quiet: #a3a8b0; } }
html, body { height: 100%; margin: 0; }
body { display: grid; place-items: center; background: var(--paper); color: var(--ink); font: 16px system-ui, sans-serif; }
main { display: grid; gap: 14px; justify-items: center; text-align: center; padding: 24px; }
.pulse { width: 48px; height: 48px; border-radius: 50%; background: var(--accent); animation: pulse 1s ease-in-out infinite; }
@keyframes pulse { 50% { transform: scale(1.2); opacity: 0.6; } }
@media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
h1 { font-size: 22px; margin: 0; overflow-wrap: anywhere; }
p { margin: 0; color: var(--quiet); font-size: 28px; font-variant-numeric: tabular-nums; }
.row { display: flex; gap: 12px; margin-top: 8px; }
button { border: 0; font: inherit; cursor: pointer; padding: 12px 36px; border-radius: 999px; font-weight: 600; background: var(--ink); color: var(--paper); }
button.quiet { background: transparent; color: var(--ink); box-shadow: inset 0 0 0 1px var(--quiet); }
button:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
`;

function sound(rampSeconds: number): string {
  return `
const context = new AudioContext();
const tone = context.createOscillator();
const beat = context.createOscillator();
const level = context.createGain();
const depth = context.createGain();
tone.type = 'square';
tone.frequency.value = 880;
beat.type = 'square';
beat.frequency.value = 2;
depth.gain.value = 0.25;
level.gain.setValueAtTime(${rampSeconds > 0 ? '0' : '0.25'}, context.currentTime);
${rampSeconds > 0 ? `level.gain.linearRampToValueAtTime(0.25, context.currentTime + ${String(rampSeconds)});` : ''}
beat.connect(depth).connect(level.gain);
tone.connect(level).connect(context.destination);
tone.start();
beat.start();
context.resume();
for (const button of document.querySelectorAll('button')) {
  button.addEventListener('click', () => {
    document.title = '${RING_CHOICE_TITLE_PREFIX}' + button.dataset.choice;
  });
}`;
}

export function ringPageUrl(ring: DesktopRing): string {
  const snooze =
    ring.kind === 'alarm'
      ? '<button class="quiet" data-choice="snooze" type="button">Snooze</button>'
      : '';
  const label = ring.kind === 'timer' ? 'Stop' : 'Dismiss';
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(ringTitle(ring))}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<div class="pulse" aria-hidden="true"></div>
<h1>${escapeHtml(ringTitle(ring))}</h1>
<p>${escapeHtml(ringTime(ring))}</p>
<div class="row">${snooze}<button data-choice="dismiss" type="button" autofocus>${label}</button></div>
</main>
<script>${sound(ring.rampSeconds)}</script>
</body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
