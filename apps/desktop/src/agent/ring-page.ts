export const RING_STOP_TITLE = 'smarteverything-ring-stop';

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SmartEverything is ringing</title>
<style>
:root { color-scheme: light dark; --ink: #14161a; --paper: #f4f5f7; --accent: #e5484d; }
@media (prefers-color-scheme: dark) { :root { --ink: #f4f5f7; --paper: #14161a; } }
html, body { height: 100%; margin: 0; }
body { display: grid; place-items: center; background: var(--paper); color: var(--ink); font: 16px system-ui, sans-serif; }
main { display: grid; gap: 16px; justify-items: center; text-align: center; padding: 24px; }
.pulse { width: 56px; height: 56px; border-radius: 50%; background: var(--accent); animation: pulse 1s ease-in-out infinite; }
@keyframes pulse { 50% { transform: scale(1.25); opacity: 0.6; } }
@media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
h1 { font-size: 20px; margin: 0; }
button { border: 0; font: inherit; cursor: pointer; display: inline-block; padding: 12px 40px; border-radius: 999px; background: var(--ink); color: var(--paper); font-weight: 600; }
button:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
</style>
</head>
<body>
<main>
<div class="pulse" aria-hidden="true"></div>
<h1>This computer is being rung</h1>
<button id="stop" type="button" autofocus>Stop</button>
</main>
<script>
const context = new AudioContext();
const tone = context.createOscillator();
const beat = context.createOscillator();
const level = context.createGain();
const depth = context.createGain();
tone.type = 'square';
tone.frequency.value = 880;
beat.type = 'square';
beat.frequency.value = 2;
level.gain.value = 0.5;
depth.gain.value = 0.5;
beat.connect(depth).connect(level.gain);
tone.connect(level).connect(context.destination);
tone.start();
beat.start();
context.resume();
document.getElementById('stop').addEventListener('click', () => {
  document.title = '${RING_STOP_TITLE}';
});
</script>
</body>
</html>`;

export function ringPageUrl(): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`;
}
