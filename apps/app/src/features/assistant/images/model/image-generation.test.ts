import {
  IMAGE_EDIT_INPUT,
  IMAGE_GENERATE_INPUT,
  IMAGE_OPERATION_RECEIPT,
  type ImageOperationReceipt,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  detailRows,
  elapsedSeconds,
  frameCells,
  generationStage,
  noticeLineOf,
  previewBlur,
  promptLine,
  retryOf,
} from './image-generation';

const ID = '00000000-0000-4000-8000-000000000001';
const CHAT = '00000000-0000-4000-8000-000000000002';
const IMAGE = '00000000-0000-4000-8000-000000000003';
const STARTED = '2026-11-06T10:00:00.000Z';
const ENDED = '2026-11-06T10:00:18.000Z';
const SHA = 'a'.repeat(64);

function receipt(
  patch: Record<string, unknown> = {},
  request: Record<string, unknown> = {},
): ImageOperationReceipt {
  return IMAGE_OPERATION_RECEIPT.parse({
    id: ID,
    profile_id: CHAT,
    chat_id: CHAT,
    request: {
      operation_id: ID,
      chat_id: CHAT,
      prompt: 'Warm kitchen at dusk',
      model: 'imagen-4',
      mode: 'generate',
      options: {},
      ...request,
    },
    endpoint: {
      model: 'imagen-4',
      name: 'Imagen 4',
      provider_tag: 'google',
      parameters: {},
      supports_streaming: true,
      pricing: [],
    },
    inputs: [],
    state: 'running',
    progress: 0,
    results: [],
    message_id: null,
    created_at: STARTED,
    updated_at: ENDED,
    reason: null,
    usage: null,
    ...patch,
  });
}

function result(width: number, height: number): ImageOperationReceipt['results'][number] {
  return {
    attachment: {
      id: IMAGE,
      name: 'kitchen.png',
      mime: 'image/png',
      bytes: 10,
      width,
      height,
    },
    operation_id: ID,
    parents: [],
    sha256: SHA,
  };
}

const dollars = (amount: number): string => `$${amount.toFixed(3)}`;

describe('image generation stages', () => {
  it('maps every receipt state to the frame stage it draws', () => {
    expect(generationStage(receipt({ state: 'reserved' }))).toBe('queued');
    expect(generationStage(receipt({ state: 'running' }))).toBe('painting');
    expect(generationStage(receipt({ state: 'completed' }))).toBe('saved');
    expect(generationStage(receipt({ state: 'failed' }))).toBe('failed');
  });

  it('sharpens the blur with every preview that arrives', () => {
    const blurs = [1, 2, 3, 4].map(previewBlur);
    expect(blurs[0]).toBe(18);
    expect(blurs).toEqual([...blurs].sort((left, right) => right - left));
  });

  it('counts live seconds from the start and never shows a negative time', () => {
    expect(elapsedSeconds(STARTED, Date.parse(STARTED) + 6_400)).toBe(6);
    expect(elapsedSeconds(STARTED, Date.parse(STARTED) - 2_000)).toBe(0);
  });
});

describe('image generation frame', () => {
  it('draws one cell per requested variation at the requested aspect', () => {
    const cells = frameCells(receipt({}, { options: { n: 4, aspect_ratio: '3:2' } }));
    expect(cells).toHaveLength(4);
    expect(cells[0]).toEqual({ width: 1.5, height: 1 });
  });

  it('names variations on the prompt line', () => {
    expect(promptLine(receipt({}, { options: { n: 4 } }))).toBe(
      '4 variations of Warm kitchen at dusk',
    );
    expect(promptLine(receipt())).toBe('Warm kitchen at dusk');
  });
});

describe('image details', () => {
  it('lists model, saved size, seed, time and cost for a finished image', () => {
    const done = receipt(
      { state: 'completed', results: [result(1536, 1024)], usage: { cost: 0.04 } },
      { options: { seed: 482991 } },
    );
    expect(detailRows(done, dollars).map((row) => [row.label, row.value])).toEqual([
      ['Prompt', 'Warm kitchen at dusk'],
      ['Model', 'Imagen 4'],
      ['Size', '1536 × 1024'],
      ['Seed', '482991'],
      ['Time', '18 s'],
      ['Cost', '$0.040'],
    ]);
  });

  it('says the cost was not reported once finished and leaves time out while painting', () => {
    const labels = (item: ImageOperationReceipt): readonly string[] =>
      detailRows(item, dollars).map((row) => `${row.label}:${row.value}`);
    expect(labels(receipt({ state: 'failed' }))).toContain('Cost:Not reported');
    expect(labels(receipt({}, { options: { size: '1024x1024' } }))).toEqual([
      'Prompt:Warm kitchen at dusk',
      'Model:Imagen 4',
      'Size:1024 × 1024',
    ]);
  });
});

describe('image notice line', () => {
  it('collapses a failed request to its reason with Edit prompt and Retry', () => {
    expect(noticeLineOf(receipt({ state: 'failed', reason: 'The model refused.' }))).toEqual({
      text: 'The model refused.',
      tone: 'critical',
      actions: ['edit', 'retry'],
    });
  });

  it('offers a receipt check instead of a retry when the outcome is unknown', () => {
    expect(noticeLineOf(receipt({ state: 'unknown' }))?.actions).toEqual(['edit', 'check']);
  });

  it('shows no notice while painting or once images are saved', () => {
    expect(noticeLineOf(receipt())).toBeNull();
    expect(noticeLineOf(receipt({ state: 'completed', results: [result(4, 3)] }))).toBeNull();
  });
});

describe('image retry', () => {
  it('repeats a generate request the hub accepts, without the stream flag', () => {
    const retry = retryOf(receipt({}, { options: { n: 2, stream: true, seed: 7 } }));
    expect(retry.kind).toBe('generate');
    expect(IMAGE_GENERATE_INPUT.parse(retry.body)).toMatchObject({
      chatId: CHAT,
      prompt: 'Warm kitchen at dusk',
      model: 'imagen-4',
      options: { n: 2, seed: 7 },
    });
  });

  it('repeats an edit with the same source and references', () => {
    const retry = retryOf(
      receipt(
        {},
        {
          mode: 'edit',
          provider_tag: 'google',
          source: { kind: 'attachment', attachment_id: IMAGE },
          references: [{ kind: 'latest', origin: 'uploaded' }],
        },
      ),
    );
    expect(retry.kind).toBe('edit');
    expect(IMAGE_EDIT_INPUT.parse(retry.body)).toMatchObject({
      providerTag: 'google',
      source: IMAGE,
      references: ['latestUploaded'],
    });
  });
});
