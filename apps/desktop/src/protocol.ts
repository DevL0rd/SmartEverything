import { NATIVE_HTML_SCHEME } from '@smarteverything/domain';
import { stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { net, protocol, type Session } from 'electron';
import { APP_HOST, APP_SCHEME, isAppOrigin } from './origin.js';
import { planWebResponse, resolveWebPath } from './web-root.js';

export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: NATIVE_HTML_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

function isAbsentPath(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch (error: unknown) {
    if (isAbsentPath(error)) {
      return false;
    }
    throw error;
  }
}

function refusal(status: number, message: string): Response {
  return new Response(message, { status, headers: { 'content-type': 'text/plain' } });
}

async function respond(root: string, request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return refusal(405, `the web export is read only; received ${request.method}`);
  }
  const url = new URL(request.url);
  if (url.host !== APP_HOST) {
    return refusal(404, `the web export is served on ${APP_HOST}; received host ${url.host}`);
  }
  const resolved = resolveWebPath(root, url.pathname);
  const exists = resolved.kind === 'inside' && (await isFile(resolved.filePath));
  const plan = planWebResponse(root, resolved, exists);
  switch (plan.kind) {
    case 'file':
    case 'index':
      return net.fetch(pathToFileURL(plan.filePath).toString());
    case 'not-found':
      return refusal(404, `no file in the web export at ${url.pathname}`);
    case 'refused':
      return refusal(403, `${plan.reason}; received ${plan.received}`);
  }
}

export function serveWebExport(root: string): void {
  protocol.handle(APP_SCHEME, (request) => respond(root, request));
}

export function enforceContentSecurityPolicy(session: Session, policy: string): void {
  session.webRequest.onHeadersReceived((details, callback) => {
    if (!isAppOrigin(details.url)) {
      callback({});
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
        'X-Content-Type-Options': ['nosniff'],
      },
    });
  });
}
