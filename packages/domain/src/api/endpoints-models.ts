import { z } from 'zod';
import {
  MODEL_CATALOG_ROW,
  MODEL_EXTRA,
  MODEL_OVERRIDE_INPUT,
  MODEL_OVERRIDE_ROW,
  MODEL_OVERRIDE_SCOPES,
  MODEL_SHA256,
} from '../models/catalog';
import { MODEL_SOURCES } from '../models/resolve';
import { MODEL_ID, NAME, TOKEN } from '../models/spec-base';
import { DEVICE_FAMILIES } from '../presentation/types';
import { NO_BODY, endpoint } from './endpoint';
import { ID, NOTHING } from './primitives';

export const MODEL_LISTING_QUERY = z.strictObject({
  category: TOKEN.optional(),
  family: z.enum(DEVICE_FAMILIES).optional(),
  q: z.string().trim().min(1).optional(),
});

export const MODEL_LISTING = z.object({ models: z.array(MODEL_CATALOG_ROW) });

export type ModelListing = z.output<typeof MODEL_LISTING>;

export const DEVICE_MODEL_VIEW = z.object({
  id: MODEL_ID.nullable(),
  asset_hash: MODEL_SHA256.nullable(),
  source: z.enum(MODEL_SOURCES),
  finish: NAME.nullable(),
  extras: z.array(MODEL_EXTRA),
});

export type DeviceModelView = z.output<typeof DEVICE_MODEL_VIEW>;

const MODEL_CANDIDATE = z.object({
  id: MODEL_ID,
  title: z.string().min(1),
  category: TOKEN,
});

const MODEL_IDENTITY = z.object({
  brand: z.string(),
  model_string: z.string(),
  hardware_model: z.string().nullable(),
});

export const DEVICE_MODELS = z.object({
  device_id: ID,
  model: DEVICE_MODEL_VIEW,
  params: z.record(NAME, z.number()),
  identity: MODEL_IDENTITY,
  candidates: z.array(MODEL_CANDIDATE),
  finishes: z.array(NAME),
  default_finish: NAME.nullable(),
  overrides: z.array(MODEL_OVERRIDE_ROW),
  issues: z.array(z.string()),
});

export type DeviceModels = z.output<typeof DEVICE_MODELS>;

export const MODEL_OVERRIDE_RESET_QUERY = z.strictObject({
  scope: z.enum(MODEL_OVERRIDE_SCOPES).default('device'),
});

export const MODEL_OVERRIDE_RESET = z.object({
  scope: z.enum(MODEL_OVERRIDE_SCOPES),
  target: z.string().min(1),
  removed: z.boolean(),
});

export const MODEL_ASSET_UPLOAD_KINDS = ['spec', 'glb'] as const;

export const MODEL_ASSET_UPLOAD = z.strictObject({
  kind: z.enum(MODEL_ASSET_UPLOAD_KINDS),
  data: z.base64(),
});

export const MODEL_ASSET_STORED = z.object({
  sha256: MODEL_SHA256,
  kind: z.enum(MODEL_ASSET_UPLOAD_KINDS),
  size: z.int().positive(),
  model_id: MODEL_ID.nullable(),
});

export type ModelAssetStored = z.output<typeof MODEL_ASSET_STORED>;

const DEVICE_PARAMS = z.strictObject({ deviceId: ID });

export const MODEL_AREA_ENDPOINTS = {
  listModels: endpoint({
    method: 'GET',
    path: '/api/models',
    access: 'member',
    summary:
      'The model catalogue, filtered by category, device family and words in names, aliases and brands',
    params: NOTHING,
    query: MODEL_LISTING_QUERY,
    body: NO_BODY,
    response: MODEL_LISTING,
  }),
  readDeviceModels: endpoint({
    method: 'GET',
    path: '/api/devices/:deviceId/models',
    access: 'member',
    summary:
      'The model a device is drawn with and where it came from, the candidate models, the finishes and the overrides that apply',
    params: DEVICE_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DEVICE_MODELS,
  }),
  setDeviceModelOverride: endpoint({
    method: 'PUT',
    path: '/api/devices/:deviceId/model-override',
    access: 'member',
    summary:
      'Draw this device, every device of its make and model, or every device of its family with a catalogue model or an uploaded model file, with an optional finish and parameters',
    params: DEVICE_PARAMS,
    query: NOTHING,
    body: MODEL_OVERRIDE_INPUT,
    response: MODEL_OVERRIDE_ROW,
  }),
  resetDeviceModelOverride: endpoint({
    method: 'DELETE',
    path: '/api/devices/:deviceId/model-override',
    access: 'member',
    summary:
      'Remove the model override of this device, of its make and model, or of its family so the provided model is used again',
    params: DEVICE_PARAMS,
    query: MODEL_OVERRIDE_RESET_QUERY,
    body: NO_BODY,
    response: MODEL_OVERRIDE_RESET,
  }),
  uploadModelAsset: endpoint({
    method: 'POST',
    path: '/api/model-assets',
    access: 'owner',
    summary: 'Upload a model spec JSON or a GLB model file as base64 to use as an override',
    params: NOTHING,
    query: NOTHING,
    body: MODEL_ASSET_UPLOAD,
    response: MODEL_ASSET_STORED,
  }),
  readModelAsset: endpoint({
    method: 'GET',
    path: '/api/model-assets/:sha256',
    access: 'member',
    summary: 'The bytes of one stored model file by its sha256, cached forever',
    params: z.strictObject({ sha256: MODEL_SHA256 }),
    query: NOTHING,
    body: NO_BODY,
    response: z
      .string()
      .describe('The raw file bytes, sent with their own content type and never as JSON'),
  }),
} as const;
