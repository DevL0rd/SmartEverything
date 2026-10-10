export const PAGE_STYLE = `
:root { color-scheme: light dark; --bg: #f5f6fb; --card: #ffffff; --text: #141826;
  --muted: #5b6275; --accent: #5b5bf0; }
@media (prefers-color-scheme: dark) { :root { --bg: #0d1020; --card: #171b2e; --text: #eef0f8;
  --muted: #a3a9c0; --accent: #8c8cff; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
  background: var(--bg); color: var(--text);
  font: 16px/1.5 system-ui, -apple-system, Roboto, sans-serif; }
main { max-width: 420px; width: 100%; background: var(--card); border-radius: 20px;
  padding: 32px 28px; box-shadow: 0 12px 40px rgb(0 0 0 / 12%); text-align: center; }
.brand { font-weight: 700; letter-spacing: 0.02em; color: var(--accent); margin: 0 0 20px; }
h1 { font-size: 22px; margin: 0 0 8px; }
p { margin: 0; color: var(--muted); }
`;
