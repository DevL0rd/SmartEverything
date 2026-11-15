import { escapeHtml, htmlPage } from '../../server/page-style';

const TOKENS = `
:root { color-scheme: light dark;
  --bg: #f6f5f2; --surface-1: #ffffff; --surface-2: #f0eee9; --surface-3: #e7e4de;
  --text: #18171b; --muted: #5d5952; --outline: rgba(0, 0, 0, 0.14);
  --outline-variant: rgba(0, 0, 0, 0.07); --primary: #955607; --on-primary: #ffffff;
  --primary-container: rgba(149, 86, 7, 0.14); --on-primary-container: #8a4f07;
  --positive: #1a7a43; --positive-container: rgba(26, 122, 67, 0.12);
  --critical: #c8321e; --critical-container: rgba(200, 50, 30, 0.1);
  --shadow: 0 1px 2px rgb(0 0 0 / 6%), 0 8px 24px rgb(0 0 0 / 6%); }
@media (prefers-color-scheme: dark) { :root {
  --bg: #0b0b0d; --surface-1: #141417; --surface-2: #1b1b1f; --surface-3: #24242a;
  --text: #f2f1ee; --muted: #a9a49c; --outline: rgba(255, 255, 255, 0.14);
  --outline-variant: rgba(255, 255, 255, 0.07); --primary: #f2b45e; --on-primary: #1a1206;
  --primary-container: rgba(242, 180, 94, 0.16); --on-primary-container: #f2b45e;
  --positive: #6fd39a; --positive-container: rgba(111, 211, 154, 0.14);
  --critical: #ff6b57; --critical-container: rgba(255, 107, 87, 0.14);
  --shadow: 0 1px 2px rgb(0 0 0 / 40%); } }
`;

const LAYOUT = `
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text);
  font: 16px/1.5 Geist, Inter, system-ui, -apple-system, Roboto, sans-serif;
  display: flex; justify-content: center; padding: 24px 16px 48px; }
main { width: 100%; max-width: 560px; display: flex; flex-direction: column; gap: 16px; }
.brand { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px;
  font-weight: 600; letter-spacing: 0.02em; margin: 0 4px; }
.brand::before { content: ''; width: 10px; height: 10px; border-radius: 50%;
  background: var(--primary); }
.card { background: var(--surface-1); border: 1px solid var(--outline-variant);
  border-radius: 16px; padding: 20px; box-shadow: var(--shadow);
  display: flex; flex-direction: column; gap: 12px; }
h1 { font-size: 24px; line-height: 1.25; margin: 0; font-weight: 600; letter-spacing: -0.01em;
  overflow-wrap: anywhere; }
h2 { font-size: 13px; margin: 0; font-weight: 600; color: var(--muted);
  text-transform: uppercase; letter-spacing: 0.06em; }
p { margin: 0; overflow-wrap: anywhere; }
.muted { color: var(--muted); }
.small { font-size: 13px; }
.facts { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.facts li { background: var(--surface-2); border-radius: 999px; padding: 4px 12px;
  font-size: 14px; color: var(--muted); overflow-wrap: anywhere; }
.facts li strong { color: var(--text); font-weight: 600; }
label { display: block; font-size: 14px; font-weight: 600; margin: 4px 0 6px; }
input, textarea { font: inherit; color: var(--text); background: var(--surface-2);
  border: 1px solid var(--outline); border-radius: 12px; padding: 12px 14px; width: 100%;
  min-height: 48px; }
textarea { resize: vertical; min-height: 72px; }
input:focus, textarea:focus, button:focus-visible { outline: 2px solid var(--primary);
  outline-offset: 2px; }
button { font: inherit; font-weight: 600; cursor: pointer; border-radius: 12px; min-height: 48px;
  padding: 10px 18px; border: 1px solid transparent; background: var(--primary);
  color: var(--on-primary); }
button.quiet { background: transparent; color: var(--text); border-color: var(--outline); }
button.danger { background: var(--critical-container); color: var(--critical); }
button[disabled] { opacity: 0.5; cursor: default; }
.row { display: flex; flex-wrap: wrap; gap: 8px; }
.row > button { flex: 1 1 96px; }
.pill { align-self: flex-start; border-radius: 999px; padding: 4px 12px; font-size: 14px;
  font-weight: 600; background: var(--surface-3); color: var(--muted); }
.pill.yes { background: var(--positive-container); color: var(--positive); }
.pill.no { background: var(--critical-container); color: var(--critical); }
.pill.maybe { background: var(--primary-container); color: var(--on-primary-container); }
.notice { border-radius: 12px; padding: 12px 14px; background: var(--surface-2); }
.notice.good { background: var(--positive-container); color: var(--positive); }
.notice.bad { background: var(--critical-container); color: var(--critical); }
[hidden] { display: none !important; }
footer { color: var(--muted); font-size: 13px; text-align: center; margin-top: 8px; }
`;

export const PUBLIC_STYLE = `${TOKENS}${LAYOUT}`;

export interface PublicPage {
  readonly title: string;
  readonly body: string;
  readonly style?: string;
  readonly script?: string;
  readonly nonce?: string;
}

export function publicPageHtml(page: PublicPage): string {
  return htmlPage({
    title: page.title,
    body: `<p class="brand">SmartEverything</p>${page.body}`,
    style: `${PUBLIC_STYLE}${page.style ?? ''}`,
    script:
      page.script === undefined || page.nonce === undefined
        ? ''
        : `<script nonce="${escapeHtml(page.nonce)}">${page.script}</script>`,
  });
}

export function noticePageHtml(heading: string, message: string): string {
  return publicPageHtml({
    title: heading,
    body: `<section class="card"><h1>${escapeHtml(heading)}</h1><p class="muted">${escapeHtml(message)}</p></section>`,
  });
}
