import { describe, expect, it } from 'vitest';
import { API_ENDPOINTS } from '../../src';
import {
  DEVICE_MODELS,
  DEVICE_MODEL_VIEW,
  MODEL_AREA_ENDPOINTS,
  MODEL_ASSET_UPLOAD,
} from '../../src/api/endpoints-models';

const HASH = 'a'.repeat(64);

describe('the model endpoints', () => {
  it('are part of the endpoint table under unique names, methods and paths', () => {
    const names = Object.keys(MODEL_AREA_ENDPOINTS);
    expect(names).toHaveLength(6);
    for (const name of names) {
      expect(API_ENDPOINTS).toHaveProperty(name);
    }
    const keys = Object.values(API_ENDPOINTS).map((shape) => `${shape.method} ${shape.path}`);
    const own = Object.values(MODEL_AREA_ENDPOINTS).map((shape) => `${shape.method} ${shape.path}`);
    for (const key of own) {
      expect(keys.filter((other) => other === key)).toHaveLength(1);
    }
  });

  it('describe each endpoint in one line', () => {
    for (const shape of Object.values(MODEL_AREA_ENDPOINTS)) {
      expect(shape.summary).not.toContain('\n');
      expect(shape.summary.length).toBeGreaterThan(20);
    }
  });

  it('give uploading to the owner and everything else to a member', () => {
    expect(
      Object.fromEntries(
        Object.entries(MODEL_AREA_ENDPOINTS).map(([name, shape]) => [name, shape.access]),
      ),
    ).toStrictEqual({
      listModels: 'member',
      readDeviceModels: 'member',
      setDeviceModelOverride: 'member',
      resetDeviceModelOverride: 'member',
      uploadModelAsset: 'owner',
      readModelAsset: 'member',
    });
  });

  it('read a hash only as sixty-four lower-case hex digits', () => {
    const params = MODEL_AREA_ENDPOINTS.readModelAsset.params;
    expect(params.safeParse({ sha256: HASH }).success).toBe(true);
    expect(params.safeParse({ sha256: 'A'.repeat(64) }).success).toBe(false);
    expect(params.safeParse({ sha256: HASH.slice(1) }).success).toBe(false);
  });

  it('read a reset scope that defaults to the device', () => {
    const query = MODEL_AREA_ENDPOINTS.resetDeviceModelOverride.query;
    expect(query.parse({})).toStrictEqual({ scope: 'device' });
    expect(query.parse({ scope: 'family' })).toStrictEqual({ scope: 'family' });
    expect(query.safeParse({ scope: 'room' }).success).toBe(false);
  });

  it('take an upload as a kind and base64 data and nothing else', () => {
    expect(MODEL_ASSET_UPLOAD.safeParse({ kind: 'glb', data: 'AAAA' }).success).toBe(true);
    expect(MODEL_ASSET_UPLOAD.safeParse({ kind: 'image', data: 'AAAA' }).success).toBe(false);
    expect(MODEL_ASSET_UPLOAD.safeParse({ kind: 'spec', data: 'not base64!' }).success).toBe(false);
    expect(MODEL_ASSET_UPLOAD.safeParse({ kind: 'spec', data: 'AAAA', url: 'x' }).success).toBe(
      false,
    );
  });

  it('take an override that names exactly one of a model and an uploaded file', () => {
    const body = MODEL_AREA_ENDPOINTS.setDeviceModelOverride.body;
    expect(body.safeParse({ scope: 'device', model_id: 'dev.fan.wiz' }).success).toBe(true);
    expect(body.safeParse({ scope: 'identity', asset_hash: HASH, finish: 'dark' }).success).toBe(
      true,
    );
    expect(body.safeParse({ scope: 'device' }).success).toBe(false);
    expect(
      body.safeParse({ scope: 'device', model_id: 'dev.fan.wiz', asset_hash: HASH }).success,
    ).toBe(false);
  });

  it('read the device model view leniently so new fields do not break old readers', () => {
    const view = { id: 'dev.fan.wiz', asset_hash: null, source: 'none', finish: null, extras: [] };
    expect(DEVICE_MODEL_VIEW.safeParse({ ...view, later: 1 }).success).toBe(true);
    expect(DEVICE_MODEL_VIEW.safeParse({ ...view, source: 'guess' }).success).toBe(false);
    expect(
      DEVICE_MODELS.safeParse({
        device_id: '3f5f3c9e-5a2d-4c8e-9a53-2f1d3a9d0b11',
        model: view,
        params: {},
        identity: { brand: 'WiZ', model_string: 'x', hardware_model: null },
        candidates: [],
        finishes: [],
        default_finish: null,
        overrides: [],
        issues: [],
        later: true,
      }).success,
    ).toBe(true);
  });
});
