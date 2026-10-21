import { describe, expect, it } from 'vitest';
import {
  editRequestOf,
  generateRequestOf,
  IMAGE_EDIT_INPUT,
  IMAGE_GENERATE_INPUT,
  IMAGE_OPERATION_REQUEST,
} from '../src/image-operations';

const ID = '3a000000-0000-4000-8000-0000000000a1';
const BASE = {
  chatId: ID,
  prompt: 'a lamp',
  model: 'vendor/m1',
};

describe('the image action decides the request mode', () => {
  it('generates when no image is given', () => {
    const request = generateRequestOf(IMAGE_GENERATE_INPUT.parse(BASE), ID, null);
    expect(IMAGE_OPERATION_REQUEST.parse(request).mode).toBe('generate');
  });

  it('generates from references when only style references are given', () => {
    const request = generateRequestOf(
      IMAGE_GENERATE_INPUT.parse({ ...BASE, references: [ID] }),
      ID,
      null,
    );
    expect(IMAGE_OPERATION_REQUEST.parse(request).mode).toBe('reference');
  });

  it('edits with the source and keeps the references', () => {
    const request = editRequestOf(
      IMAGE_EDIT_INPUT.parse({ ...BASE, source: ID, references: [ID] }),
      ID,
      null,
    );
    const parsed = IMAGE_OPERATION_REQUEST.parse(request);
    expect(parsed.mode).toBe('edit');
    expect(parsed.mode === 'edit' ? parsed.references : []).toHaveLength(1);
  });

  it('takes the operation id from the server and the provider only when given', () => {
    const request = IMAGE_OPERATION_REQUEST.parse(
      generateRequestOf(IMAGE_GENERATE_INPUT.parse(BASE), ID, null),
    );
    expect(request.operation_id).toBe(ID);
    expect(request.provider_tag).toBeUndefined();
    expect(IMAGE_GENERATE_INPUT.safeParse({ ...BASE, operation_id: ID }).success).toBe(false);
  });

  it('does not take a mode from the AI, and an edit defaults to the latest image', () => {
    expect(IMAGE_GENERATE_INPUT.safeParse({ ...BASE, mode: 'generate' }).success).toBe(false);
    expect(IMAGE_EDIT_INPUT.parse(BASE).source).toBe('latest');
  });
});
