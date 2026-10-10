import { randomBytes } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { MCP_PATHS } from '@smarteverything/domain';

const STYLE = `
:root { color-scheme: light dark; --bg: #f5f5f7; --card: #ffffff; --text: #1d1d1f; --muted: #6e6e73;
  --line: #d2d2d7; --accent: #0a84ff; --danger: #d70015; }
@media (prefers-color-scheme: dark) { :root { --bg: #000000; --card: #1c1c1e; --text: #f5f5f7;
  --muted: #a1a1a6; --line: #38383a; --danger: #ff453a; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
  background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, -apple-system, sans-serif; }
main { width: 100%; max-width: 440px; background: var(--card); border: 1px solid var(--line);
  border-radius: 16px; padding: 28px 24px; }
h1 { font-size: 22px; line-height: 1.3; margin: 0 0 12px; }
p { margin: 0 0 12px; }
.muted { color: var(--muted); font-size: 14px; }
.error { color: var(--danger); font-weight: 600; }
dl { margin: 16px 0; display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; font-size: 14px; }
dt { color: var(--muted); }
dd { margin: 0; overflow-wrap: anywhere; }
label { display: block; font-weight: 600; margin: 20px 0 8px; }
input[type=text] { width: 100%; font: 28px/1.2 ui-monospace, monospace; letter-spacing: 0.3em;
  text-align: center; padding: 12px; border: 1px solid var(--line); border-radius: 12px;
  background: var(--bg); color: var(--text); }
.actions { display: flex; gap: 12px; margin-top: 20px; }
button { flex: 1; font: inherit; font-weight: 600; padding: 12px; border-radius: 12px;
  border: 1px solid var(--line); background: var(--card); color: var(--text); cursor: pointer; }
button[value=approve] { background: var(--accent); border-color: var(--accent); color: #ffffff; }
.waiting { display: flex; gap: 12px; align-items: center; padding: 14px 16px; border-radius: 12px;
  background: var(--bg); font-weight: 600; }
.waiting::before { content: ''; flex: none; width: 10px; height: 10px; border-radius: 50%;
  background: var(--accent); animation: pulse 1.6s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.25; } }
@media (prefers-reduced-motion: reduce) { .waiting::before { animation: none; } }
details { margin-top: 16px; }
summary { cursor: pointer; color: var(--accent); font-size: 14px; }
`;

const FORM_ACTION = MCP_PATHS.authorize.slice(MCP_PATHS.authorize.lastIndexOf('/') + 1);

export interface ConsentView {
  readonly requestId: string;
  readonly homeName: string;
  readonly clientName: string;
  readonly clientUri: string | null;
  readonly redirectUri: string;
  readonly problem: string | null;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function page(title: string, body: string, script = ''): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title><style>${STYLE}</style></head>
<body><main>${body}</main>${script}</body></html>`;
}

function codeForm(view: ConsentView): string {
  const problem =
    view.problem === null ? '' : `<p class="error" role="alert">${escapeHtml(view.problem)}</p>`;
  return `<form method="post" action="${FORM_ACTION}" autocomplete="off">
<input type="hidden" name="request" value="${escapeHtml(view.requestId)}">
<details${view.problem === null ? '' : ' open'}><summary>Use an approval code instead</summary>
<label for="approval">Approval code</label>
<input id="approval" name="approval" type="text" inputmode="numeric" maxlength="80"
  placeholder="000000">
<p class="muted">In SmartEverything on your computer, open Settings → AI assistants and choose
Show a code.</p>
${problem}
<div class="actions"><button type="submit" name="decision" value="approve">Approve with code</button></div>
</details>
<div class="actions"><button type="submit" name="decision" value="deny">Deny</button></div>
</form>`;
}

function consentBody(view: ConsentView): string {
  const redirect = new URL(view.redirectUri);
  const website =
    view.clientUri === null ? '' : `<dt>Website</dt><dd>${escapeHtml(view.clientUri)}</dd>`;
  const wait = `${FORM_ACTION}?request=${encodeURIComponent(view.requestId)}`;
  return `<h1>Allow ${escapeHtml(view.clientName)} to use ${escapeHtml(view.homeName)}?</h1>
<p>It will be able to see every device, camera snapshot, automation and health figure in this
home, and to control devices, scenes and automations as the owner.</p>
<dl><dt>Assistant</dt><dd>${escapeHtml(view.clientName)}</dd>${website}
<dt>Returns to</dt><dd>${escapeHtml(redirect.host)}</dd></dl>
<p id="waiting" class="waiting" role="status" data-wait="${escapeHtml(wait)}">Allow or deny it in
the SmartEverything app. Only allow it if you started this connection yourself.</p>
${codeForm(view)}`;
}

const WAIT_SCRIPT = `const notice = document.getElementById('waiting');
const source = new EventSource(notice.dataset.wait);
source.addEventListener('redirect', (event) => { source.close(); location.replace(event.data); });
source.addEventListener('closed', (event) => {
  source.close();
  notice.textContent = event.data;
  document.querySelector('form').hidden = true;
});`;

function securityHeaders(
  formTargets: readonly string[],
  scriptNonce: string | null,
): Record<string, string> {
  const script =
    scriptNonce === null ? [] : [`script-src 'nonce-${scriptNonce}'`, "connect-src 'self'"];
  return {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      ...script,
      `form-action 'self' ${formTargets.join(' ')}`.trim(),
      "frame-ancestors 'none'",
      "base-uri 'none'",
    ].join('; '),
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  };
}

export function sendConsent(response: ServerResponse, status: number, view: ConsentView): void {
  const nonce = randomBytes(16).toString('base64');
  const html = page(
    'Connect an assistant',
    consentBody(view),
    `<script nonce="${nonce}">${WAIT_SCRIPT}</script>`,
  );
  response.writeHead(status, securityHeaders([new URL(view.redirectUri).origin], nonce));
  response.end(html);
}

export function sendProblem(response: ServerResponse, status: number, message: string): void {
  const html = page(
    'Cannot connect',
    `<h1>This connection cannot continue</h1><p>${escapeHtml(message)}</p>
<p class="muted">Start connecting again from your assistant.</p>`,
  );
  response.writeHead(status, securityHeaders([], null));
  response.end(html);
}
