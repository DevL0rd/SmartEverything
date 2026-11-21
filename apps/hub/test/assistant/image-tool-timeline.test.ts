import { describe, expect, it } from 'vitest';
import { imageOperationIdOfCall } from '../../src/assistant/image/call-operation';
import { toolTimelineDetails } from '../../src/assistant/conversation/tool-timeline-details';

const ID = '3a000000-0000-4000-8000-0000000000a1';
const REQUEST = { prompt: 'a lamp', model: 'vendor/m1' };

describe('the image card of a running image call', () => {
  it('is linked from the call id before the result arrives, as the hub names the operation', () => {
    const details = toolTimelineDetails(
      'image_gen',
      { input: { action: 'generate', ...REQUEST } },
      'call-7',
    );
    expect(details.image_operation_id).toBe(imageOperationIdOfCall('call-7'));
  });

  it('is linked the same way for an edit', () => {
    const source = { kind: 'attachment', attachment_id: ID };
    const details = toolTimelineDetails(
      'image_gen',
      { input: { action: 'edit', source, ...REQUEST } },
      'call-8',
    );
    expect(details.image_operation_id).toBe(imageOperationIdOfCall('call-8'));
  });

  it('gives a stable well-formed id per call', () => {
    expect(imageOperationIdOfCall('call-7')).toBe(imageOperationIdOfCall('call-7'));
    expect(imageOperationIdOfCall('call-7')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });

  it('is linked from a receipt the tool returned inside a text result', () => {
    const stamp = '2026-11-21T10:00:00.000Z';
    const receipt = {
      id: ID,
      profile_id: ID,
      chat_id: ID,
      request: { mode: 'generate', operation_id: ID, chat_id: ID, options: {}, ...REQUEST },
      endpoint: {
        model: REQUEST.model,
        name: 'Painter',
        provider_tag: 'fast',
        parameters: {},
        supports_streaming: false,
        pricing: [],
      },
      inputs: [],
      state: 'running',
      progress: 0,
      results: [],
      message_id: null,
      created_at: stamp,
      updated_at: stamp,
      reason: null,
      usage: null,
    };
    const output = JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(receipt) }] });
    expect(toolTimelineDetails('home_edit', { output }, 'call-2').image_operation_id).toBe(ID);
  });

  it('is not linked from a large result that holds no receipt', () => {
    const rows = Array.from({ length: 5000 }, (_, index) => ({ id: String(index), name: 'x' }));
    const output = JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ rows }) }] });
    expect(toolTimelineDetails('read_file', { output }, 'call-3').image_operation_id).toBeNull();
    expect(
      toolTimelineDetails('read_file', { output: { rows } }, 'call-4').image_operation_id,
    ).toBeNull();
  });

  it('is not linked from other tools', () => {
    expect(
      toolTimelineDetails('home_read', { input: { action: 'x' } }, 'call-1').image_operation_id,
    ).toBeNull();
  });
});
