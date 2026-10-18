import { describe, expect, it } from 'vitest';
import { ASSISTANT_ATTACHMENT, ASSISTANT_ATTACHMENT_BYTES_MAX } from '../src/assistant';

const attachment = (bytes: number): unknown => ({
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
});
