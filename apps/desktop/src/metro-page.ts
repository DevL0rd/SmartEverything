import { Logger } from '@smarteverything/logging';
import type { BrowserWindow } from 'electron';

const log = new Logger('desktop.metro');
const ABORTED_LOAD = -3;
const METRO_COMMAND = 'pnpm --filter @smarteverything/app start';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function unreachablePage(startUrl: string, reason: string): string {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Metro isn’t running</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0A0A0C;color:#EDEDF0;font:15px/1.5 system-ui,sans-serif}
main{max-width:30rem;padding:24px}h1{font-size:20px;margin:0 0 8px}p{color:#A1A1AA;margin:0 0 16px}
code{background:#1C1C21;padding:2px 6px;border-radius:6px;color:#EDEDF0}
a{display:inline-block;padding:10px 16px;border-radius:10px;background:#EDEDF0;color:#0A0A0C;text-decoration:none;font-weight:600}</style>
</head><body><main><h1>Metro isn’t running</h1>
<p>SmartEverything Dev loads the app from ${escapeHtml(startUrl)}. Start Metro with <code>${escapeHtml(METRO_COMMAND)}</code>, then try again.</p>
<p>${escapeHtml(reason)}</p><a href="${escapeHtml(startUrl)}">Try again</a></main></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

export function logMetroLoadFailure(_window: BrowserWindow, error: unknown): void {
  log.error('desktop.metro.load_failed', error);
}

export function showMetroUnreachable(window: BrowserWindow, startUrl: string): void {
  window.webContents.on('did-fail-load', (...failure) => {
    const [, code, description, url, isMainFrame] = failure;
    if (!isMainFrame || code === ABORTED_LOAD) {
      return;
    }
    log.warn('desktop.metro.unreachable', { url, description });
    window.loadURL(unreachablePage(startUrl, description)).catch((error: unknown) => {
      log.error('desktop.metro.page_failed', error);
    });
  });
}
