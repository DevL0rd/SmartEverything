export const RING_PAGE_STYLE = `
:root {
  color-scheme: dark;
  --bg: #0b0b0d;
  --surface-1: #141417;
  --surface-2: #1b1b1f;
  --surface-3: #24242a;
  --ink: #f2f1ee;
  --variant: #a9a49c;
  --faint: #77736c;
  --outline: rgba(255, 255, 255, 0.14);
  --outline-variant: rgba(255, 255, 255, 0.07);
  --primary: #f2b45e;
  --on-primary: #1a1206;
  --primary-container: rgba(242, 180, 94, 0.16);
  --caution: #f29a4e;
  --critical: #ff6b57;
  --positive: #6fd39a;
}
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
  background: var(--bg);
  color: var(--ink);
  font: 15px/1.4 system-ui, sans-serif;
  overflow: hidden;
  user-select: none;
}
.glow {
  position: fixed; inset: auto -30% -45% -30%; height: 90%;
  background: radial-gradient(closest-side, rgba(242, 180, 94, 0.38), rgba(242, 180, 94, 0));
  animation: breathe 4s ease-in-out infinite; pointer-events: none;
}
@keyframes breathe { 50% { opacity: 0.55; transform: scale(0.94); } }
main {
  position: relative; height: 100%; display: flex; flex-direction: column;
  gap: 20px; padding: 28px 24px 24px;
}
.head { display: grid; grid-template-columns: minmax(0, 1fr); justify-items: center; gap: 4px; text-align: center; }
.kind { display: flex; align-items: center; gap: 8px; color: var(--variant); font-size: 14px; min-width: 0; max-width: 100%; }
.kind span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kind svg { flex: none; color: var(--primary); }
.time {
  margin: 0; display: flex; align-items: baseline; gap: 8px; white-space: nowrap;
  font: 500 96px/1 ui-monospace, monospace;
  letter-spacing: -0.06em; font-variant-numeric: tabular-nums;
}
.time small { font-size: 28px; letter-spacing: 0; color: var(--variant); }
.time small:empty { display: none; }
.date { color: var(--variant); font-size: 14px; }
.note {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  color: var(--variant); font-size: 13px; text-align: center; min-height: 20px;
}
.note svg { flex: none; }
.note.warn { color: var(--caution); }
.failed {
  margin: 0; padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(255, 107, 87, 0.35);
  background: rgba(255, 107, 87, 0.12); color: var(--critical); font-size: 13px; text-align: center;
}
.card {
  background: rgba(20, 20, 23, 0.8); border: 1px solid var(--outline-variant);
  border-radius: 20px; padding: 16px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px;
}
.card h2 { margin: 0; font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.card h2 svg { color: var(--primary); flex: none; }
.card p { margin: 0; color: var(--variant); font-size: 13px; }
.progress { display: flex; gap: 6px; }
.progress i { height: 4px; flex: 1; border-radius: 2px; background: var(--surface-3); }
.progress i.done { background: var(--primary); }
.problem { font: 500 32px/1.1 ui-monospace, monospace; font-variant-numeric: tabular-nums; text-align: center; }
form { display: flex; gap: 8px; }
input {
  flex: 1; min-width: 0; height: 48px; border-radius: 14px; border: 1px solid var(--outline);
  background: var(--surface-2); color: var(--ink); padding: 0 14px;
  font: 500 20px ui-monospace, monospace; font-variant-numeric: tabular-nums;
}
input:focus { outline: 2px solid var(--primary); outline-offset: 1px; }
.wrong { color: var(--critical); font-size: 13px; min-height: 18px; text-align: center; }
.shake { animation: shake 0.3s; }
@keyframes shake { 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
.spacer { flex: 1; }
.actions { display: grid; gap: 10px; }
button {
  border: 0; font: 600 16px system-ui, sans-serif; cursor: pointer; height: 52px;
  border-radius: 999px; display: flex; align-items: center; justify-content: center; gap: 8px;
}
button.primary { background: var(--primary); color: var(--on-primary); }
button.tonal { background: var(--primary-container); color: var(--primary); }
form button { height: 48px; padding: 0 20px; border-radius: 14px; }
button:hover { filter: brightness(1.08); }
button:focus-visible { outline: 3px solid var(--ink); outline-offset: 3px; }
.caption { color: var(--faint); font-size: 12px; text-align: center; margin: 0; }
@media (prefers-reduced-motion: reduce) { .glow, .shake { animation: none; } }
`;
