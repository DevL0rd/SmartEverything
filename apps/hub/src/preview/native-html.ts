import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  ApiError,
  NATIVE_HTML_CLAIM,
  NATIVE_HTML_CLAIM_PATH,
  NATIVE_HTML_DOCUMENT,
  NATIVE_PROJECT_DOCUMENT,
  NATIVE_PROJECT_ASSET_PATH,
  type NativeHtmlClaim,
} from '@smarteverything/domain';
import type { PreviewService } from './service';
import type { Store } from '../store/store';
import { authenticate, type Caller } from '../server/auth';
import { parseJsonBody, readBody } from '../server/http';
import type { RawRoute } from '../server/http-server';
import { projectEntryUrl } from './project-content';
import { serveProjectAsset } from './project-response';
import { isHtmlPreview } from './sources';
import type { ViewerLease, NativeViewerLease } from './leases';

const CLAIM_BODY_BYTES = 16 * 1024;
export function nativeHtmlClaimRoute(store: Store, preview: PreviewService): RawRoute {
  return {
    method: 'POST',
    path: NATIVE_HTML_CLAIM_PATH,
    handle: async (request, response): Promise<void> => {
      const caller = authenticate(store, request, 'member', false);
      const claim = NATIVE_HTML_CLAIM.parse(
        parseJsonBody(request, await readBody(request, CLAIM_BODY_BYTES)),
      );
      const lease = claimHtml(preview, caller, claim);
      try {
        await holdProjection(request, response, lease, { preview, claim });
      } catch (cause) {
        preview.leases.close(lease);
        throw cause;
      }
    },
  };
}
function claimHtml(
  preview: PreviewService,
  caller: Caller,
  claim: NativeHtmlClaim,
): ViewerLease | NativeViewerLease {
  if (caller.kind !== 'client') throw new ApiError('forbidden', 'HTML requires its paired viewer.');
  const publication = preview.documents.visible(caller, claim.chatId, claim.lease.publication_id);
  if (
    publication.view.revision !== claim.lease.revision ||
    publication.view.profile_id !== claim.lease.profile_id
  )
    throw new ApiError('forbidden', 'The exact HTML publication lease is required.');
  const native = 'purpose' in claim.lease;
  const descriptor =
    'purpose' in claim.lease
      ? { id: claim.lease.id, code: claim.lease.bootstrap_code }
      : gatewayBootstrap(claim);
  const lease = native ? preview.leases.native(descriptor.id) : preview.leases.host(descriptor.id);
  if (lease.clientId !== caller.client.id || lease.publication !== publication)
    throw new ApiError('forbidden', 'The HTML lease belongs to another paired viewer or revision.');
  preview.leases.validate(lease);
  return native
    ? preview.leases.bootstrapNative(descriptor.id, descriptor.code)
    : preview.leases.bootstrap(descriptor.id, descriptor.code);
}

function gatewayBootstrap(claim: NativeHtmlClaim): { readonly id: string; readonly code: string } {
  if ('purpose' in claim.lease)
    throw new ApiError('forbidden', 'Native HTML claims have no gateway origin.');
  const url = new URL(claim.lease.url);
  const code = url.searchParams.get('code');
  const validUrl =
    url.protocol === 'https:' &&
    [url.username, url.password, url.hash].every((part) => part === '') &&
    url.origin === claim.lease.origin &&
    url.pathname === '/.se-preview/bootstrap';
  if (
    !validUrl ||
    [...url.searchParams.keys()].length !== 1 ||
    code === null ||
    !/^[0-9a-f]{64}$/.test(code)
  )
    throw new ApiError('forbidden', 'The exact HTML publication bootstrap is required.');
  return { id: url.host, code };
}
async function holdProjection(
  request: IncomingMessage,
  response: ServerResponse,
  lease: ViewerLease | NativeViewerLease,
  input: { readonly preview: PreviewService; readonly claim: NativeHtmlClaim },
): Promise<void> {
  const { preview, claim } = input;
  if (!isHtmlPreview(lease.publication))
    throw new ApiError('forbidden', 'HTML projection requires HTML.');
  const document = await presentationDocument(lease, claim);
  lease.abort.signal.throwIfAborted();
  const close = (): void => {
    response.end();
  };
  const cleanup = (): void => {
    lease.abort.signal.removeEventListener('abort', close);
    preview.leases.close(lease);
  };
  lease.abort.signal.addEventListener('abort', close, { once: true });
  response.once('close', cleanup);
  request.once('aborted', close);
  response.writeHead(200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-accel-buffering': 'no',
  });
  response.write(`${JSON.stringify(document)}\n`);
  if (lease.abort.signal.aborted) close();
}

async function presentationDocument(
  lease: ViewerLease | NativeViewerLease,
  claim: NativeHtmlClaim,
): Promise<unknown> {
  if (!isHtmlPreview(lease.publication))
    throw new ApiError('forbidden', 'HTML presentation requires a document.');
  const identity = {
    publicationId: lease.publication.view.id,
    revision: lease.publication.view.revision,
    profileId: lease.profileId,
    expiresAt: null,
  };
  if (
    lease.publication.view.project_source !== undefined &&
    claim.capability === 'native-project-v1'
  )
    return NATIVE_PROJECT_DOCUMENT.parse({
      ...identity,
      kind: 'project',
      leaseId: lease.id,
      assetToken: lease.assetToken,
      entryPath: projectEntryUrl(lease.publication.view.project_source.entry),
    });
  if (lease.publication.view.project_source?.standalone === false)
    throw new ApiError(
      'conflict',
      'This project requires native-project-v1 asset support or the isolated HTTPS gateway.',
    );
  return NATIVE_HTML_DOCUMENT.parse({ ...identity, html: await lease.publication.readHtml() });
}
export function nativeProjectAssetRoutes(
  store: Store,
  preview: PreviewService,
): readonly RawRoute[] {
  return ['GET', 'HEAD'].map((method) => ({
    method: method === 'GET' ? ('GET' as const) : ('HEAD' as const),
    path: NATIVE_PROJECT_ASSET_PATH,
    handle: async (request, response, params): Promise<void> => {
      const caller = authenticate(store, request, 'member', false);
      if (caller.kind !== 'client')
        throw new ApiError('forbidden', 'Project assets require their paired viewer.');
      const lease = preview.leases.asset(params['leaseId'] ?? '');
      const url = new URL(request.url ?? '/', 'http://hub.invalid');
      if (
        lease.clientId !== caller.client.id ||
        request.headers['x-se-preview-read-capability'] !== lease.assetToken ||
        !isHtmlPreview(lease.publication)
      )
        throw new ApiError(
          'forbidden',
          'The project read capability differs from its paired viewer or publication.',
        );
      preview.documents.visible(caller, lease.publication.view.chat_id, lease.publication.view.id);
      const path = url.searchParams.get('path');
      if (path === null)
        throw new ApiError('invalid_request', 'The project asset path is required.');
      await serveProjectAsset(request, response, {
        publication: lease.publication,
        path,
        signal: lease.abort.signal,
        ancestors: ["'none'"],
      });
    },
  }));
}
