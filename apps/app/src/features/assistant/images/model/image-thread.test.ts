import { IMAGE_OPERATION_RECEIPT, type ImageOperationReceipt } from '@smarteverything/domain';
import { expect, it } from 'vitest';
import { attachImageOperations, showImageReceiptLoading } from './image-thread';

const TOOL = '00000000-0000-5000-8000-000000000001';
const DIRECT = '00000000-0000-4000-8000-000000000001';
const CHAT = '00000000-0000-4000-8000-000000000002';
const NOW = '2026-11-06T10:00:01.000Z';

function receipt(id: string): ImageOperationReceipt {
  return IMAGE_OPERATION_RECEIPT.parse({
    id,
    profile_id: CHAT,
    chat_id: CHAT,
    request: {
      operation_id: id,
      chat_id: CHAT,
      prompt: 'A tree',
      model: 'fixture',
      mode: 'generate',
      options: {},
    },
    endpoint: {
      model: 'fixture',
      name: 'Fixture',
      provider_tag: 'fixture',
      parameters: {},
      supports_streaming: false,
      pricing: [],
    },
    origin: { kind: id === TOOL ? 'execution' : 'client', principal_id: 'test' },
    inputs: [],
    state: 'running',
    progress: 0,
    results: [],
    message_id: null,
    created_at: NOW,
    updated_at: NOW,
    reason: null,
    usage: null,
  });
}

it('keeps a tool receipt out of the standalone list before and after its inline anchor arrives', () => {
  const receipts = [receipt(TOOL), receipt(DIRECT)];
  const placement = { hidden: new Set<string>(), replyStartedAt: NOW };
  const before = attachImageOperations([], receipts, { ...placement, boundImages: new Set() });
  const after = attachImageOperations([], receipts, { ...placement, boundImages: new Set([TOOL]) });
  expect(before.map((item) => item.key)).toEqual([`image-operation-${DIRECT}`]);
  expect(after).toEqual(before);
  const settled = attachImageOperations([], receipts, {
    ...placement,
    replyStartedAt: null,
    boundImages: new Set(),
  });
  expect(settled).toHaveLength(2);
});

it('reserves the known inline slot until its receipt or a terminal tool state arrives', () => {
  expect(showImageReceiptLoading(false, true, false)).toBe(true);
  expect(showImageReceiptLoading(false, false, true)).toBe(true);
  expect(showImageReceiptLoading(true, false, true)).toBe(false);
  expect(showImageReceiptLoading(false, false, false)).toBe(false);
});
