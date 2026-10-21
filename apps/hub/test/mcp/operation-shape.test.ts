import type { EndpointName, McpPartName } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { operationInput, operationShape } from '../../src/extensions/mcp/tools/operation-shape';
import { operationTool } from '../../src/extensions/mcp/tools/operation-tools';

const ID = '3f1b2c8e-6f0a-4c1e-9a52-0d1c1f4e7a10';

describe('the fields an operation tool takes', () => {
  it('names the person of a profile operation personId and sends it as the endpoint’s profileId', () => {
    const shape = operationShape('updateProfile');
    expect(Object.keys(shape.input.shape)).toContain('personId');
    expect(Object.keys(shape.input.shape)).not.toContain('profileId');
    expect(shape.input.safeParse({ name: 'Sam' }).success).toBe(false);
    expect(operationInput(shape, { personId: ID, name: 'Sam' })).toMatchObject({
      params: { profileId: ID },
      body: { name: 'Sam' },
    });
  });

  it('names a camera deviceId in every operation tool', () => {
    const shape = operationShape('showCameraInCall');
    expect(Object.keys(shape.input.shape)).toContain('deviceId');
    expect(Object.keys(shape.input.shape)).not.toContain('cameraId');
    expect(operationInput(shape, { callId: ID, deviceId: ID })).toMatchObject({
      body: { cameraId: ID },
    });
  });

  it('adds personId to a personal operation that has no person field, and only acts as that person there', () => {
    const personal = operationShape('listFoods');
    expect(Object.keys(personal.input.shape)).toContain('personId');
    expect(personal.acting).toBe(true);
    expect(operationShape('readPresence').acting).toBe(false);
    expect(operationShape('listWakes').acting).toBe(true);
  });

  it('rejects the old endpoint field names', () => {
    const shape = operationShape('updateProfile');
    expect(() => operationInput(shape, { profileId: ID })).toThrow('does not take profileId');
  });
});

describe('the annotations of an operation tool', () => {
  it('start from the HTTP method and apply the traits of the operation', () => {
    const annotations = (tool: McpPartName, operation: EndpointName): unknown =>
      operationTool(tool, operation).listing.annotations;
    expect(annotations('project_read', 'readAiProjectFiles')).toMatchObject({
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
    });
    expect(annotations('write_project_files', 'writeAiProjectFiles')).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    });
    expect(annotations('list_image_endpoints', 'listImageEndpoints')).toMatchObject({
      readOnlyHint: true,
      openWorldHint: true,
    });
    expect(annotations('list_models', 'listAiModels')).toMatchObject({ readOnlyHint: true });
  });
});
