import { describe, expect, it } from 'vitest';
import {
  MODEL_AREA_ENDPOINTS,
  isAdminOperation,
  isHumanOnlyOperation,
  mcpOperationArea,
} from '../../src';

const MODEL_OPERATIONS = [
  'listModels',
  'readDeviceModels',
  'setDeviceModelOverride',
  'resetDeviceModelOverride',
  'uploadModelAsset',
  'readModelAsset',
] as const;

describe('the model endpoints for the AI', () => {
  it('puts every model endpoint in the devices area so call_operation reaches it', () => {
    expect(Object.keys(MODEL_AREA_ENDPOINTS).sort()).toEqual([...MODEL_OPERATIONS].sort());
    for (const name of MODEL_OPERATIONS)
      expect(mcpOperationArea(MODEL_AREA_ENDPOINTS[name])).toBe('devices');
  });

  it('leaves every model endpoint to the AI under its own access level', () => {
    for (const name of MODEL_OPERATIONS) {
      expect(isHumanOnlyOperation(name)).toBe(false);
      expect(isAdminOperation(name)).toBe(false);
    }
    expect(MODEL_AREA_ENDPOINTS.uploadModelAsset.access).toBe('owner');
    expect(MODEL_AREA_ENDPOINTS.setDeviceModelOverride.access).toBe('member');
    expect(MODEL_AREA_ENDPOINTS.resetDeviceModelOverride.access).toBe('member');
  });
});
