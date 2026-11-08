import { z } from 'zod';
import { HOME_MAP_SCAN, HOME_MAP_SCAN_FORMATS, HOME_MAP_SCAN_HASH } from '../home-map-scan';
import { HOME_MAP_MAP_ID } from '../home-map-set';
import { HOME_MAP_REVISION_ANSWER } from './endpoints-home-map';
import { NO_BODY, endpoint } from './endpoint';
import { MEDIA_LINK } from './endpoints-media';
import { NOTHING } from './primitives';

const SCAN_PARAMS = z.strictObject({ mapId: HOME_MAP_MAP_ID });

const RAW_BYTES = z
  .string()
  .describe('The raw file bytes, sent with their own content type and never as JSON');

const UPLOAD_QUERY = z.strictObject({
  format: z.enum(HOME_MAP_SCAN_FORMATS),
  name: z.string().trim().min(1),
});

const LINK_QUERY = z.strictObject({ hash: HOME_MAP_SCAN_HASH });

export const HOME_MAP_SCAN_STORED = z.strictObject({
  revision: z.int().nonnegative(),
  scan: HOME_MAP_SCAN,
});

export type HomeMapScanStored = z.infer<typeof HOME_MAP_SCAN_STORED>;

export const HOME_MAP_SCAN_ENDPOINTS = {
  uploadHomeMapScan: endpoint({
    method: 'PUT',
    path: '/api/home-maps/:mapId/scan',
    access: 'member',
    summary:
      'Upload the realistic 3D scan of a house map as the raw file body (ply, splat, spz or rad), replacing the previous scan; the body length must equal the declared length',
    params: SCAN_PARAMS,
    query: UPLOAD_QUERY,
    body: RAW_BYTES,
    response: HOME_MAP_SCAN_STORED,
  }),
  homeMapScanLink: endpoint({
    method: 'GET',
    path: '/api/home-maps/:mapId/scan/link',
    access: 'member',
    summary:
      'A short-lived signed path that downloads one file of the current scan of a house map, the original or its converted level-of-detail version, chosen by its content hash; the path serves HTTP Range requests',
    params: SCAN_PARAMS,
    query: LINK_QUERY,
    body: NO_BODY,
    response: MEDIA_LINK,
  }),
  removeHomeMapScan: endpoint({
    method: 'DELETE',
    path: '/api/home-maps/:mapId/scan',
    access: 'member',
    summary: 'Remove the realistic 3D scan of a house map; answers the new revision',
    params: SCAN_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: HOME_MAP_REVISION_ANSWER,
  }),
} as const;
