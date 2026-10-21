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

  it('is not linked from other tools', () => {
    expect(
      toolTimelineDetails('home_read', { input: { action: 'x' } }, 'call-1').image_operation_id,
    ).toBeNull();
  });
});
