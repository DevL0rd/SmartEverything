import { request as requestHttps } from 'node:https';
import { request as requestHttp, type IncomingMessage, type ClientRequest } from 'node:http';
import {
  AI_PREVIEW_HTML_MAX,
  NATIVE_HTML_CLAIM_PATH,
  NATIVE_PREVIEW_DOCUMENT,
  BrowserPolicyError,
  type NativePreviewDocument,
  type NativeHtmlOpen,
} from '@smarteverything/domain';
import type { HubLeasePort } from '../../../hub/src/client-network/lease';

const FRAME_BYTES = 6 * AI_PREVIEW_HTML_MAX + 4096;
const ADMISSION_MS = 15_000;
export interface NativeHtmlClaimPort extends HubLeasePort {
  authorize(scopeId: string, authorization: string, ownerId: number): void;
}
export interface ClaimedHtml {
  readonly document: NativePreviewDocument;
  readonly input: NativeHtmlOpen;
  readonly signal: AbortSignal;
  readonly close: () => void;
}
interface Admission {
  readonly input: NativeHtmlOpen;
  readonly lifetime: AbortController;
  readonly accept: (document: NativePreviewDocument) => void;
  readonly reject: (cause: unknown) => void;
  readonly failed: () => void;
}
export function claimNativeHtml(
  port: NativeHtmlClaimPort,
  input: NativeHtmlOpen,
  owner: number,
): Promise<ClaimedHtml> {
  if (input.binding.scopeId !== input.scopeId || input.binding.credentialKind !== 'client')
    throw new BrowserPolicyError('HTML projection requires its independently paired client.');
  port.authorize(input.scopeId, input.authorization, owner);
  const lease = port.lease(
    input.scopeId,
    `${input.binding.canonicalOrigin}${NATIVE_HTML_CLAIM_PATH}`,
    input.binding,
    input.routeGeneration,
  );
  const lifetime = new AbortController();
  const signal =
    lease.signal === undefined ? lifetime.signal : AbortSignal.any([lease.signal, lifetime.signal]);
  return new Promise((resolve, reject) => {
    const create = lease.url.protocol === 'https:' ? requestHttps : requestHttp;
    const request = create(lease.url, {
      method: 'POST',
      agent: lease.agent,
      signal,
      ...{ hubAbortSignal: signal },
      headers: {
        authorization: input.authorization,
        'content-type': 'application/json',
        accept: 'application/x-ndjson',
      },
    });
    admit(request, {
      input,
      lifetime,
      reject,
      failed: routeFailure(port, input, lease.signal, lifetime.signal),
      accept: (document): void => {
        resolve({
          document,
          input,
          signal,
          close: (): void => {
            lifetime.abort();
          },
        });
      },
    });
    request.end(JSON.stringify(input.claim));
  });
}
function routeFailure(
  port: NativeHtmlClaimPort,
  input: NativeHtmlOpen,
  selected: AbortSignal | undefined,
  lifetime: AbortSignal,
): () => void {
  return (): void => {
    if (selected?.aborted !== true && !lifetime.aborted)
      port.failed?.(input.scopeId, input.routeGeneration);
  };
}
function admit(request: ClientRequest, admission: Admission): void {
  const timeout = setTimeout(() => {
    admission.lifetime.abort();
  }, ADMISSION_MS);
  timeout.unref();
  request.on('response', (response) => {
    if (
      response.statusCode !== 200 ||
      response.headers['content-type'] !== 'application/x-ndjson; charset=utf-8'
    ) {
      response.destroy();
      admission.lifetime.abort();
      admission.reject(new BrowserPolicyError('The paired server refused the HTML claim.'));
      return;
    }
    readProjection(response, {
      ...admission,
      accept: (document): void => {
        clearTimeout(timeout);
        admission.accept(document);
      },
    });
  });
  request.on('error', (cause: Error) => {
    admission.failed();
    clearTimeout(timeout);
    admission.lifetime.abort();
    admission.reject(cause);
  });
  request.on('close', () => {
    clearTimeout(timeout);
    admission.lifetime.abort();
  });
}
function validateDocument(raw: unknown, input: NativeHtmlOpen): NativePreviewDocument {
  const document = NATIVE_PREVIEW_DOCUMENT.parse(raw);
  const lease = input.claim.lease;
  if (
    document.publicationId !== lease.publication_id ||
    document.revision !== lease.revision ||
    document.profileId !== lease.profile_id ||
    document.expiresAt !== lease.expires_at ||
    ('html' in document
      ? Buffer.byteLength(document.html) > AI_PREVIEW_HTML_MAX
      : input.claim.capability !== 'native-project-v1' ||
        document.leaseId !== ('purpose' in lease ? lease.id : new URL(lease.origin).hostname))
  )
    throw new BrowserPolicyError('HTML claim projection differs from its server lease.');
  return document;
}
function readProjection(response: IncomingMessage, admission: Admission): void {
  let first: Buffer = Buffer.alloc(0);
  let accepted = false;
  const fail = (cause: unknown): void => {
    admission.lifetime.abort();
    admission.reject(cause);
  };
  response.on('data', (chunk: Buffer) => {
    try {
      if (accepted || first.length + chunk.length > FRAME_BYTES)
        throw new BrowserPolicyError('Unexpected HTML claim frame.');
      first = Buffer.concat([first, chunk]);
      const end = first.indexOf(10);
      if (end === -1) return;
      if (end !== first.length - 1) throw new BrowserPolicyError('Unexpected HTML claim bytes.');
      const raw: unknown = JSON.parse(first.subarray(0, end).toString('utf8'));
      const document = validateDocument(raw, admission.input);
      accepted = true;
      first = Buffer.alloc(0);
      admission.accept(document);
    } catch (cause: unknown) {
      response.destroy();
      fail(cause);
    }
  });
  response.on('end', () => {
    fail(new BrowserPolicyError('The HTML claim lifetime ended.'));
  });
  response.on('aborted', () => {
    fail(new BrowserPolicyError('The HTML claim stream was interrupted.'));
  });
  response.on('error', (cause: Error) => {
    admission.failed();
    fail(cause);
  });
}
