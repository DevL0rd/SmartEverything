import { describe, expect, it } from 'vitest';
import { ASSISTANT_ATTACHMENT, ASSISTANT_ATTACHMENT_BYTES_MAX } from '../src/assistant';
import { inlineAssistantAttachmentMime } from '../src/assistant-attachment-mime';

const attachment = (bytes: number): Record<string, unknown> => ({
  id: '3f2b7c1e-1a2b-4c3d-8e4f-5a6b7c8d9e0f',
  name: 'a.png',
  mime: 'image/png',
  bytes,
  width: null,
  height: null,
});

describe('assistant attachments', () => {
  it('keeps the per-file size limit', () => {
    expect(ASSISTANT_ATTACHMENT.safeParse(attachment(ASSISTANT_ATTACHMENT_BYTES_MAX)).success).toBe(
      true,
    );
    expect(
      ASSISTANT_ATTACHMENT.safeParse(attachment(ASSISTANT_ATTACHMENT_BYTES_MAX + 1)).success,
    ).toBe(false);
  });

  it('accepts levels from 0 to 255 or none and rejects other values', () => {
    const withLevels = (levels: unknown): boolean =>
      ASSISTANT_ATTACHMENT.safeParse({ ...attachment(5), levels }).success;
    expect(withLevels([0, 128, 255])).toBe(true);
    expect(withLevels(null)).toBe(true);
    expect(withLevels([256])).toBe(false);
    expect(withLevels([-1])).toBe(false);
    expect(withLevels([1.5])).toBe(false);
  });

  it.each([
    [' IMAGE/PNG ', 'image/png'],
    ['text/plain; charset=utf-8', 'text/plain'],
    ['application/json', 'application/json'],
    ['audio/ogg', 'audio/ogg'],
    ['video/webm', 'video/webm'],
    ['audio/', null],
    ['audio/test\r\nX-Injected: header', null],
    ['image/svg+xml', null],
    ['text/html', null],
    ['application/xhtml+xml', null],
    ['text/xml', null],
    ['application/javascript', null],
    ['application/pdf', null],
    ['', null],
  ])('resolves the safe inline content type of %j', (mime, expected) => {
    expect(inlineAssistantAttachmentMime(mime)).toBe(expected);
  });
});
