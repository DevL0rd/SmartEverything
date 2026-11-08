import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  IMAGE_OPERATION_RECEIPT,
  type ImageOperationPreview,
  type ImageOperationReceipt,
} from '@smarteverything/domain';
import { ImageOperationBubble } from './image-receipts';

const preview = vi.hoisted(() => {
  const holder: { current: ImageOperationPreview | null } = { current: null };
  return holder;
});

vi.mock('react-native-reanimated', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAnimatedStyle: (style: () => object): object => style(),
}));
vi.mock('../../../../design/colour', () => ({ useColour: (role: string): string => role }));
vi.mock('../../data/remote', () => ({
  useAttachmentLinks: (): { readonly data: undefined } => ({ data: undefined }),
}));
vi.mock('../../components/image-viewer', () => ({ ImageViewer: (): null => null }));
vi.mock('../data/image-retry', () => ({
  useImageRetry: (): (() => Promise<void>) => () => Promise.resolve(),
}));
vi.mock('../data/image-queries', () => ({
  useImagePreview: (): ImageOperationPreview | null => preview.current,
  useImageOperations: (): { readonly data: readonly [] } => ({ data: [] }),
  useImageActions: (): Record<'read' | 'cancel', () => void> => ({
    read: vi.fn(),
    cancel: vi.fn(),
  }),
}));

const ID = '00000000-0000-4000-8000-000000000001';
const CHAT = '00000000-0000-4000-8000-000000000002';
const IMAGE = '00000000-0000-4000-8000-000000000003';
const AT = '2026-11-06T10:00:00.000Z';

function receipt(patch: Record<string, unknown>): ImageOperationReceipt {
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
      options: { aspect_ratio: '3:2' },
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
    created_at: AT,
    updated_at: '2026-11-06T10:00:03.000Z',
    reason: null,
    usage: null,
    ...patch,
  });
}

function render(item: ImageOperationReceipt): string {
  return renderToStaticMarkup(
    createElement(ImageOperationBubble, {
      item: { type: 'image-operation', key: item.id, receipt: item, message: null, group: false },
      flash: false,
      renderMessage: () => null,
      announce: false,
    }),
  );
}

describe('image generation bubble', () => {
  it('draws a queued frame with the prompt line and a cancel action', () => {
    const markup = render(receipt({ state: 'reserved' }));
    expect(markup).toContain('Queued');
    expect(markup).toContain('Warm kitchen at dusk');
    expect(markup).toContain('Cancel');
    expect(markup).not.toContain('Painting');
  });

  it('paints the latest preview under a blur with the live seconds tag', () => {
    preview.current = {
      type: 'image_operation_preview',
      operation_id: ID,
      profile_id: CHAT,
      chat_id: CHAT,
      mime: 'image/webp',
      width: 300,
      height: 200,
      bytes: 4,
      data: 'AAAA',
    };
    const markup = render(receipt({ state: 'running', progress: 1 }));
    preview.current = null;
    expect(markup).toContain('Painting');
    expect(markup).toContain('Intermediate image preview, not saved');
    expect(markup).toMatch(/\d+:\d\d/);
  });

  it('collapses a failed request to its reason with Edit prompt and Retry', () => {
    const markup = render(receipt({ state: 'failed', reason: 'The image model refused this.' }));
    expect(markup).toContain('The image model refused this.');
    expect(markup).toContain('Edit prompt');
    expect(markup).toContain('Retry');
    expect(markup).not.toContain('Queued');
  });

  it('shows saved variations in the image grid with one prompt line', () => {
    const results = [IMAGE, '00000000-0000-4000-8000-000000000004'].map((id) => ({
      attachment: { id, name: `${id}.png`, mime: 'image/png', bytes: 10, width: 3, height: 2 },
      operation_id: ID,
      parents: [],
      sha256: 'a'.repeat(64),
    }));
    const markup = render(receipt({ state: 'completed', results }));
    expect(markup).toContain('2 variations of Warm kitchen at dusk');
    expect(markup).toContain('Again');
    expect(markup).not.toContain('Painting');
  });
});
