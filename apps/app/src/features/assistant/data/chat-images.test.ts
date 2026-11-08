import { describe, expect, it } from 'vitest';
import {
  IMAGE_OPERATION_RECEIPT,
  type AssistantAttachment,
  type AssistantMessageRow,
  type ImageOperationReceipt,
} from '@smarteverything/domain';
import { galleryImagesOf, imageActionsOf } from './chat-images';
import { draftQuote } from './drafts';

const CHAT = '00000000-0000-4000-8000-000000000003';
const OTHER_CHAT = '00000000-0000-4000-8000-000000000004';
const PROFILE = '00000000-0000-4000-8000-000000000002';

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function photo(n: number, mime = 'image/png'): AssistantAttachment {
  return {
    id: uuid(n),
    name: `photo-${String(n)}.png`,
    mime,
    bytes: 1000,
    width: 1200,
    height: 800,
  };
}

function row(
  n: number,
  minute: number,
  attachments: readonly AssistantAttachment[],
  overrides: Partial<AssistantMessageRow> = {},
): AssistantMessageRow {
  const at = `2026-11-07T10:${String(minute).padStart(2, '0')}:00.000Z`;
  return {
    id: uuid(n),
    profile_id: PROFILE,
    client_id: null,
    role: 'person',
    kind: 'text',
    author: 'Me',
    text: 'These are the **pendants**',
    attachments: [...attachments],
    state: 'answered',
    reason: null,
    reason_code: null,
    client_message_id: null,
    steps: [],
    step_states: [],
    reply_to: null,
    quote: null,
    chat_id: CHAT,
    origin: { source: 'app', plugin_id: null, device_id: null, name: 'Me' },
    embeds: [],
    cost_micros: 0,
    model: null,
    created_at: at,
    updated_at: at,
    ...overrides,
  };
}

function receipt(
  n: number,
  minute: number,
  results: readonly AssistantAttachment[],
  extra: Partial<ImageOperationReceipt> = {},
): ImageOperationReceipt {
  const at = `2026-11-07T10:${String(minute).padStart(2, '0')}:00.000Z`;
  return {
    ...IMAGE_OPERATION_RECEIPT.parse({
      id: uuid(n),
      profile_id: PROFILE,
      chat_id: CHAT,
      request: {
        mode: 'generate',
        operation_id: uuid(n),
        chat_id: CHAT,
        prompt: 'A kitchen',
        model: 'google/gemini-3-image',
        options: {},
      },
      endpoint: {
        model: 'google/gemini-3-image',
        name: 'Gemini Image',
        provider_tag: 'google',
        parameters: {},
        supports_streaming: true,
        pricing: [],
      },
      inputs: [],
      state: 'completed',
      progress: 0,
      results: results.map((attachment) => ({
        attachment,
        operation_id: uuid(n),
        parents: [],
        sha256: 'a'.repeat(64),
      })),
      message_id: null,
      created_at: at,
      updated_at: at,
      reason: null,
      usage: null,
    }),
    ...extra,
  };
}

describe('galleryImagesOf', () => {
  it('pages every image of the chat in time order with its sender, time and caption', () => {
    const mine = row(1, 5, [photo(10), photo(11)]);
    const theirs = row(2, 1, [photo(12)], {
      role: 'responder',
      author: 'Coordinator',
      text: '',
      origin: null,
    });
    const images = galleryImagesOf([mine, theirs], [], CHAT, 'Coordinator');
    expect(images.map((image) => image.attachment.id)).toEqual([uuid(12), uuid(10), uuid(11)]);
    expect(images[0]).toMatchObject({ sender: 'Coordinator', caption: '', messageId: uuid(2) });
    expect(images[1]).toMatchObject({
      sender: 'You',
      caption: 'These are the pendants',
      at: mine.created_at,
      chatId: CHAT,
    });
  });

  it('leaves out files, other chats and images already shown', () => {
    const doc = { ...photo(20, 'application/pdf'), name: 'plan.pdf' };
    const rows = [
      row(1, 1, [photo(10), doc]),
      row(2, 2, [photo(10)]),
      row(3, 3, [photo(30)], { chat_id: OTHER_CHAT }),
    ];
    const ids = galleryImagesOf(rows, [], CHAT, 'Coordinator').map((image) => image.attachment.id);
    expect(ids).toEqual([uuid(10)]);
  });

  it('adds generated results that have no loaded message, from the assistant', () => {
    const rows = [row(1, 1, [photo(10)])];
    const made = receipt(40, 2, [photo(10), photo(41)], { result_message_id: uuid(5) });
    const gone = receipt(50, 3, [photo(51)], { message_deleted: true });
    const images = galleryImagesOf(rows, [made, gone], CHAT, 'Coordinator');
    expect(images.map((image) => image.attachment.id)).toEqual([uuid(10), uuid(41)]);
    expect(images[1]).toMatchObject({ sender: 'Coordinator', messageId: uuid(5), caption: '' });
  });

  it('has no message to open or quote for a result whose message is not known yet', () => {
    const images = galleryImagesOf([], [receipt(40, 2, [photo(41)])], CHAT, 'Coordinator');
    expect(images[0]?.messageId).toBeNull();
  });
});

describe('imageActionsOf', () => {
  const [image] = galleryImagesOf([row(1, 1, [photo(10)])], [], CHAT, 'Coordinator');
  const labels = (items: ReturnType<typeof imageActionsOf>): readonly string[] =>
    items.map((item) => item.label).filter((label) => label !== 'Share');

  it('offers save, copy, quote and open in message for an image in a message', () => {
    if (image === undefined) throw new Error('missing image');
    const items = imageActionsOf(image, 'https://hub.test/a.png', () => undefined);
    expect(labels(items)).toEqual(['Save', 'Copy image', 'Quote', 'Open in message']);
    expect(items.every((item) => item.disabled !== true)).toBe(true);
  });

  it('disables the file actions until the image link is ready', () => {
    if (image === undefined) throw new Error('missing image');
    const items = imageActionsOf(image, undefined, () => undefined);
    const files = items.filter(
      (item) => item.label !== 'Quote' && item.label !== 'Open in message',
    );
    expect(files.every((item) => item.disabled === true)).toBe(true);
  });

  it('quotes the image into the chat draft after leaving the viewer', () => {
    if (image === undefined) throw new Error('missing image');
    const steps: string[] = [];
    const items = imageActionsOf(image, undefined, () => {
      steps.push(draftQuote(CHAT) === null ? 'left' : 'late');
    });
    items.find((item) => item.label === 'Quote')?.onPress();
    expect(steps).toEqual(['left']);
    expect(draftQuote(CHAT)).toEqual({
      messageId: uuid(1),
      who: 'You',
      text: 'These are the pendants',
    });
  });

  it('has no quote or open for an image without a known message', () => {
    const [made] = galleryImagesOf([], [receipt(40, 2, [photo(41)])], CHAT, 'Coordinator');
    if (made === undefined) throw new Error('missing image');
    expect(labels(imageActionsOf(made, 'https://hub.test/b.png', () => undefined))).toEqual([
      'Save',
      'Copy image',
    ]);
  });
});
