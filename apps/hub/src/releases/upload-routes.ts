import {
  API_ENDPOINTS as E,
  ApiError,
  RELEASE_UPLOAD_CHUNK_PATH,
  RELEASE_UPLOAD_OFFSET,
  type ApiEndpoints,
} from '@smarteverything/domain';
import type { IncomingMessage } from 'node:http';
import type { RunningExtension, ServerExtension } from '../extensions';
import { authenticate, directClient, type Caller } from '../server/auth';
import { sendJson } from '../server/http';
import type { RawRoute } from '../server/http-server';
import { assertOwnerRoute } from '../server/owner-route';
import { bound, type ExtensionRouteTable } from '../server/router';
import type { Store } from '../store/store';
import { releaseStaging, type ReleaseStaging } from './staging';

const OWNER_ONLY = 'Only the owner’s own app or dev machine can upload a release.';

function requireDirectOwner(caller: Caller): void {
  if (directClient(caller)?.role !== 'owner') throw new ApiError('forbidden', OWNER_ONLY);
}

type ReleaseUploadEndpointName = Extract<
  keyof ApiEndpoints,
  'beginReleaseUpload' | 'listReleaseUploads' | 'readReleaseUpload' | 'finishReleaseUpload'
>;

export function releaseUploadEndpoints(
  staging: ReleaseStaging,
): Required<Pick<ExtensionRouteTable, ReleaseUploadEndpointName>> {
  return {
    beginReleaseUpload: bound(E.beginReleaseUpload, ({ caller, body }) => {
      requireDirectOwner(caller);
      return staging.begin(body);
    }),
    listReleaseUploads: bound(E.listReleaseUploads, async ({ caller }) => {
      requireDirectOwner(caller);
      return { uploads: [...(await staging.list())] };
    }),
    readReleaseUpload: bound(E.readReleaseUpload, ({ caller, params }) => {
      requireDirectOwner(caller);
      return staging.read(params.uploadId);
    }),
    finishReleaseUpload: bound(E.finishReleaseUpload, ({ caller, params }) => {
      requireDirectOwner(caller);
      return staging.finish(params.uploadId, 'machine');
    }),
  };
}

function declaredLength(request: IncomingMessage): number | undefined {
  const header = request.headers['content-length'];
  if (header === undefined) return undefined;
  const parsed = RELEASE_UPLOAD_OFFSET.safeParse(header);
  if (!parsed.success) throw new ApiError('invalid_request', 'The content length is not valid.');
  return parsed.data;
}

export function releaseChunkRoute(store: Store, staging: ReleaseStaging): RawRoute {
  return {
    method: 'PUT',
    path: RELEASE_UPLOAD_CHUNK_PATH,
    handle: async (request, response, params): Promise<void> => {
      const caller = authenticate(store, request, 'owner', false);
      assertOwnerRoute(store, caller, {
        access: 'owner',
        method: 'PUT',
        path: RELEASE_UPLOAD_CHUNK_PATH,
      });
      requireDirectOwner(caller);
      const offset = RELEASE_UPLOAD_OFFSET.safeParse(params['offset']);
      if (!offset.success) throw new ApiError('invalid_request', 'The chunk offset is not valid.');
      sendJson(
        response,
        200,
        await staging.chunk(
          params['uploadId'] ?? '',
          offset.data,
          request,
          declaredLength(request),
        ),
      );
    },
  };
}

export function releaseUploadsExtension(now: () => Date): ServerExtension {
  return (context): Promise<RunningExtension> => {
    const staging = releaseStaging(context.layout, now);
    return Promise.resolve({
      endpoints: releaseUploadEndpoints(staging),
      routes: [releaseChunkRoute(context.store, staging)],
      stop: () => Promise.resolve(),
    });
  };
}
