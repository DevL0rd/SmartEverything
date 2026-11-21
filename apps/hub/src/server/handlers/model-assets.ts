import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import {
  API_ENDPOINTS as E,
  ApiError,
  MODEL_DEFAULTS,
  createModelMetadataIndex,
  type ModelAssetStored,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { z } from 'zod';
import { ModelCatalogService } from '../../models/catalog-service';
import { GLB_BYTE_LIMIT } from '../../models/glb-check';
import type { GlbWorker } from '../../models/glb-worker';
import type { Store } from '../../store/store';
import { authenticate, profileIdOf } from '../auth';
import { invalid } from '../invalid';
import { assertJsonBody, readBody, sendJson } from '../http';
import type { RawRoute } from '../http-server';
import { assertOwnerRoute } from '../owner-route';
import { assertScopeRoute } from '../person-scope';
import { serveBytes } from '../file-serve';
import { requestBodyOf } from '../request-body';
import type { ResponseEncoder } from '../responses/encoder';
import type { ModelRouteServices } from './models';

type Upload = z.output<typeof E.uploadModelAsset.body>;

const log = new Logger('hub.models');

const IMMUTABLE = 'public, max-age=31536000, immutable';

const UPLOAD_ENVELOPE_BYTES = 1024;

const UPLOAD_BODY_LIMIT = Math.ceil(GLB_BYTE_LIMIT / 3) * 4 + UPLOAD_ENVELOPE_BYTES;

const CONTENT_TYPES = { spec: 'application/json', glb: 'model/gltf-binary' } as const;

export function modelAuthorizer(store: Store): ModelRouteServices['authorize'] {
  return async (request, endpoint) => {
    const caller = await authenticate(store, request, endpoint.access, false);
    assertOwnerRoute(store, caller, endpoint);
    await assertScopeRoute(store, caller, endpoint, {});
    return caller;
  };
}

async function serveAsset(
  services: ModelRouteServices,
  request: IncomingMessage,
  response: ServerResponse,
  params: Readonly<Record<string, string>>,
): Promise<void> {
  await services.authorize(request, E.readModelAsset);
  const parsed = E.readModelAsset.params.safeParse(params);
  if (!parsed.success) throw invalid('path', parsed.error);
  const { sha256 } = parsed.data;
  const stored = services.assets.bytes(sha256);
  if (stored === undefined) {
    throw new ApiError('not_found', 'There is no model file with this hash.');
  }
  await serveBytes(
    {
      size: stored.size,
      etag: sha256,
      headers: {
        'cache-control': IMMUTABLE,
        'content-type': CONTENT_TYPES[stored.kind],
      },
      stream: (range) =>
        Readable.from([
          Buffer.from(
            range === undefined ? stored.bytes : stored.bytes.subarray(range.start, range.end + 1),
          ),
        ]),
    },
    request,
    response,
  );
}

async function storeUpload(
  services: ModelRouteServices,
  glb: GlbWorker,
  profile: string,
  upload: Upload,
): Promise<ModelAssetStored> {
  const bytes = Uint8Array.from(Buffer.from(upload.data, 'base64'));
  if (upload.kind === 'spec') {
    const result = services.catalog.storeUserSpec(profile, bytes);
    if (!result.stored) {
      throw new ApiError('invalid_request', `The model spec is refused: ${result.problem}.`);
    }
    return {
      sha256: result.sha256,
      kind: 'spec',
      size: bytes.byteLength,
      model_id: result.modelId,
    };
  }
  const lods = await glb.prepare(bytes);
  if (!lods.ok) {
    log.warn(lods.stage === 'check' ? 'model_asset.glb_rejected' : 'model_asset.glb_lod_failed', {
      profile,
      problem: lods.problem,
    });
    throw new ApiError('invalid_request', `The model file is refused: ${lods.problem}.`);
  }
  const row = services.assets.saveGlb(
    { kind: 'glb', owner: `user:${profile}`, bytes },
    lods.levels,
  );
  log.info('model_asset.glb_stored', {
    profile,
    sha256: row.sha256,
    size: row.size,
    triangles: lods.triangles,
    lods: lods.levels.map((level) => ({
      level: level.level,
      sha256: level.sha256,
      triangles: level.triangles,
    })),
  });
  return { sha256: row.sha256, kind: 'glb', size: row.size, model_id: null };
}

interface UploadWorkers {
  readonly encoder: ResponseEncoder;
  readonly glb: GlbWorker;
}

async function acceptUpload(
  services: ModelRouteServices,
  workers: UploadWorkers,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const caller = await services.authorize(request, E.uploadModelAsset);
  const raw = await readBody(request, UPLOAD_BODY_LIMIT);
  assertJsonBody(request);
  const upload = await requestBodyOf(workers.encoder, E.uploadModelAsset, raw);
  const stored = await storeUpload(services, workers.glb, services.profileOf(caller), upload);
  sendJson(response, 200, E.uploadModelAsset.response.parse(stored));
}

export function modelAssetRoutes(
  services: ModelRouteServices,
  workers: UploadWorkers,
): readonly RawRoute[] {
  return [
    {
      method: 'GET',
      path: E.readModelAsset.path,
      handle: (request, response, params) => serveAsset(services, request, response, params),
    },
    {
      method: 'POST',
      path: E.uploadModelAsset.path,
      handle: (request, response) => acceptUpload(services, workers, request, response),
    },
  ];
}

export function modelRouteServices(store: Store): ModelRouteServices {
  return {
    devices: store.devices,
    catalog: new ModelCatalogService({ assets: store.modelAssets, catalog: store.modelCatalog }),
    overrides: store.modelOverrides,
    assets: store.modelAssets,
    metadata: createModelMetadataIndex([]),
    defaults: () => MODEL_DEFAULTS,
    profileOf: (caller) => profileIdOf(caller),
    authorize: modelAuthorizer(store),
  };
}
